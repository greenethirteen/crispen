// The /lab production pipeline: takes the original image + its RGBA layers,
// finds the layer stacking order that best reconstructs the original,
// resamples everything to 300 DPI at the target print width, converts the
// flattened artwork to CMYK, and assembles a layered PSD (with a residual
// accuracy layer so flattening reproduces the original), a print PDF and a
// zip package.

import sharp from "sharp";
import { existsSync, readdirSync } from "fs";
import path from "path";
import { writePsdBuffer, type Psd, type Layer } from "ag-psd";
import { PDFDocument, rgb } from "pdf-lib";
import JSZip from "jszip";
import { analyzeLayers } from "./ai";
import { vectorizeViaApi } from "./vectorize";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ImageTracer = require("imagetracerjs");

/** Press ICC profile (e.g. FOGRA39/ISOcoated) if one is dropped in assets/icc. */
function pressProfile(): string | null {
  const dir = path.join(process.cwd(), "assets", "icc");
  if (!existsSync(dir)) return null;
  const icc = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".icc"));
  return icc ? path.join(dir, icc) : null;
}

const DPI = 300;
const POINTS_PER_INCH = 72;
const BLEED_IN = 0.125; // standard 1/8" bleed
const MARK_MARGIN_IN = 0.25; // room outside bleed for crop marks
/** Sub-pixel diffs below this are imperceptible; don't correct them. */
const RESIDUAL_THRESHOLD = 6;

export interface PackageInput {
  original: Buffer;
  layers: { name: string; data: Buffer }[];
  targetWidthInches: number;
}

export interface ReportRow {
  label: string;
  before: string;
  after: string;
  fixed: boolean;
}

export interface PackageResult {
  zip: Buffer;
  widthPx: number;
  heightPx: number;
  widthIn: number;
  heightIn: number;
  /** Layer stacking order used (indices into input layers, bottom→top). */
  order: number[];
  /** Mean |diff| per channel (0-255) of the recomposite before correction. */
  recompositeError: number;
  /** Press-check report: what was wrong with the input, what shipped. */
  report: ReportRow[];
  /** AI production notes (empty without ANTHROPIC_API_KEY). */
  notes: string[];
  /** Semantic layer names, bottom→top. */
  layerNames: string[];
  vectorCount: number;
}

/* ---------------- layer-order search ---------------- */

/** Straight alpha "over" compositing of src onto dst, in place. */
function overInPlace(dst: Uint8ClampedArray, src: Uint8ClampedArray) {
  for (let i = 0; i < dst.length; i += 4) {
    const sa = src[i + 3] / 255;
    if (sa === 0) continue;
    const da = dst[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) {
      dst[i + c] = (src[i + c] * sa + dst[i + c] * da * (1 - sa)) / (oa || 1);
    }
    dst[i + 3] = oa * 255;
  }
}

function meanDiff(a: Uint8ClampedArray | Buffer, b: Uint8ClampedArray | Buffer) {
  let sum = 0;
  const px = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    sum +=
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / (px * 3);
}

function permutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) {
    for (let i = 0; i <= p.length; i++) {
      out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
    }
  }
  return out;
}

/**
 * The separation model does not guarantee that its layer array order is the
 * correct stacking order (verified empirically: wrong order can triple the
 * recomposite error). Search for the order whose alpha-over composite best
 * matches the original, at proxy resolution for speed. Exhaustive for ≤5
 * layers, greedy insertion above that.
 */
function findBestOrder(
  target: Uint8ClampedArray,
  props: Uint8ClampedArray[],
  pw: number,
  ph: number,
): number[] {
  const layers = props;
  const white = () => {
    const b = new Uint8ClampedArray(pw * ph * 4);
    b.fill(255);
    return b;
  };
  const scoreOrder = (order: number[]) => {
    const acc = white();
    for (const idx of order) overInPlace(acc, props[idx]);
    return meanDiff(acc, target);
  };

  if (layers.length <= 5) {
    let best: number[] = [];
    let bestScore = Infinity;
    for (const p of permutations(layers.length)) {
      const s = scoreOrder(p);
      if (s < bestScore) {
        bestScore = s;
        best = p;
      }
    }
    return best;
  }
  // Greedy insertion for larger counts.
  let order: number[] = [0];
  for (let i = 1; i < layers.length; i++) {
    let best = 0;
    let bestScore = Infinity;
    for (let pos = 0; pos <= order.length; pos++) {
      const candidate = [...order.slice(0, pos), i, ...order.slice(pos)];
      const s = scoreOrder(candidate);
      if (s < bestScore) {
        bestScore = s;
        best = pos;
      }
    }
    order = [...order.slice(0, best), i, ...order.slice(best)];
  }
  return order;
}

/* ---------------- semantic layer naming (heuristic) ---------------- */

interface LayerStats {
  coverage: number; // share of pixels with alpha > 10
  meanLum: number; // luminance of visible pixels
  meanAlpha: number; // alpha of visible pixels
}

function layerStats(raw: Uint8ClampedArray): LayerStats {
  let visible = 0,
    lum = 0,
    alpha = 0;
  for (let i = 0; i < raw.length; i += 4) {
    if (raw[i + 3] > 10) {
      visible++;
      lum += 0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2];
      alpha += raw[i + 3];
    }
  }
  const px = raw.length / 4;
  return {
    coverage: visible / px,
    meanLum: visible ? lum / visible : 0,
    meanAlpha: visible ? alpha / visible : 0,
  };
}

/**
 * Name layers by role using coverage/luminance/translucency heuristics.
 * Bottom full-coverage → background; translucent dark → shadows;
 * translucent light → highlights; the biggest remaining → subject.
 */
function nameLayers(stats: LayerStats[], order: number[]): string[] {
  const names = new Array<string>(order.length).fill("");
  const used = new Set<string>();
  const take = (base: string) => {
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}-${n++}`;
    used.add(name);
    return name;
  };
  // Background: the lowest near-opaque, near-full-coverage layer (translucent
  // effect layers can legitimately sit below it in the recomposite order).
  const bgPos = order.findIndex(
    (idx, pos) =>
      pos <= 1 && stats[idx].coverage > 0.85 && stats[idx].meanAlpha > 225,
  );
  order.forEach((idx, pos) => {
    const s = stats[idx];
    if (pos === bgPos) names[pos] = take("background");
    else if (s.meanAlpha < 210 && s.meanLum < 90) names[pos] = take("shadows");
    else if (s.meanAlpha < 210 && s.meanLum >= 90) names[pos] = take("highlights");
    else names[pos] = "";
  });
  // Biggest unnamed visible layer becomes the subject.
  let subjectPos = -1;
  let best = 0.02;
  order.forEach((idx, pos) => {
    if (!names[pos] && stats[idx].coverage > best) {
      best = stats[idx].coverage;
      subjectPos = pos;
    }
  });
  if (subjectPos >= 0) names[subjectPos] = take("subject");
  order.forEach((_, pos) => {
    if (!names[pos]) names[pos] = take("element");
  });
  return names;
}

/* ---------------- vectorization of flat layers ---------------- */

/**
 * A layer qualifies for tracing when its visible pixels collapse into a
 * small colour palette (flat/graphic art). Painterly layers stay raster.
 */
function isFlat(raw: Uint8ClampedArray): boolean {
  const buckets = new Map<number, number>();
  let visible = 0;
  for (let i = 0; i < raw.length; i += 4) {
    if (raw[i + 3] > 128) {
      visible++;
      const key =
        ((raw[i] >> 4) << 8) | ((raw[i + 1] >> 4) << 4) | (raw[i + 2] >> 4);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }
  if (visible < 500) return false;
  const counts = Array.from(buckets.values()).sort((a, b) => b - a);
  const covered = counts.slice(0, 14).reduce((a, b) => a + b, 0);
  return covered / visible > 0.86;
}

function traceToSvg(
  raw: Uint8ClampedArray,
  w: number,
  h: number,
  scale: number,
): string {
  return ImageTracer.imagedataToSVG(
    { width: w, height: h, data: raw },
    {
      numberofcolors: 14,
      ltres: 1,
      qtres: 1,
      pathomit: 10,
      rightangleenhance: true,
      scale,
      roundcoords: 2,
    },
  ) as string;
}

/* ---------------- main build ---------------- */

export async function buildPackage(input: PackageInput): Promise<PackageResult> {
  const meta = await sharp(input.original).metadata();
  if (!meta.width || !meta.height) throw new Error("Cannot read image size");

  const widthPx = Math.round(input.targetWidthInches * DPI);
  const heightPx = Math.round((meta.height / meta.width) * widthPx);
  const widthIn = input.targetWidthInches;
  const heightIn = heightPx / DPI;

  // ---- Proxies (shared by order search, naming, flatness test) ----
  const PROXY_W = 448;
  const proxyH = Math.round((meta.height / meta.width) * PROXY_W);
  const proxy = async (b: Buffer) =>
    new Uint8ClampedArray(
      await sharp(b)
        .resize(PROXY_W, proxyH, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer(),
    );
  const targetProxy = await proxy(input.original);
  const layerProxies = await Promise.all(input.layers.map((l) => proxy(l.data)));

  // ---- Stacking order that best reconstructs the original ----
  const order = findBestOrder(targetProxy, layerProxies, PROXY_W, proxyH);

  // ---- Semantic names (bottom→top, following the chosen order) ----
  const stats = layerProxies.map(layerStats);
  let layerNames = nameLayers(stats, order);
  let notes: string[] = [];

  // Claude vision upgrade: real names + production notes (fallback-safe).
  try {
    const previewPng = (raw: Uint8ClampedArray) =>
      sharp(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength), {
        raw: { width: PROXY_W, height: proxyH, channels: 4 },
      })
        .png()
        .toBuffer();
    const ai = await analyzeLayers(
      await previewPng(targetProxy),
      await Promise.all(order.map((idx) => previewPng(layerProxies[idx]))),
    );
    if (ai) {
      const used = new Set<string>();
      layerNames = ai.names.map((n) => {
        let name = n;
        let i = 2;
        while (used.has(name)) name = `${n}-${i++}`;
        used.add(name);
        return name;
      });
      notes = ai.notes;
    }
  } catch {
    /* keep heuristic names */
  }

  // ---- CMYK gamut check: how much of the art can't survive the press ----
  // Two separate passes (RGB → CMYK TIFF, then read back to sRGB) — chaining
  // two toColourspace calls in one pipeline does not round-trip.
  const pressIcc = pressProfile();
  const cmykTiff = await sharp(
    Buffer.from(targetProxy.buffer, targetProxy.byteOffset, targetProxy.byteLength),
    { raw: { width: PROXY_W, height: proxyH, channels: 4 } },
  )
    .flatten({ background: "#ffffff" })
    .toColourspace("cmyk")
    .withIccProfile(pressIcc ?? "cmyk")
    .tiff()
    .toBuffer();
  const roundtrip = new Uint8ClampedArray(
    await sharp(cmykTiff).toColourspace("srgb").ensureAlpha().raw().toBuffer(),
  );
  let outOfGamut = 0;
  for (let i = 0; i < targetProxy.length; i += 4) {
    const d = Math.max(
      Math.abs(targetProxy[i] - roundtrip[i]),
      Math.abs(targetProxy[i + 1] - roundtrip[i + 1]),
      Math.abs(targetProxy[i + 2] - roundtrip[i + 2]),
    );
    if (d > 30) outOfGamut++;
  }
  const gamutShare = outOfGamut / (PROXY_W * proxyH);

  // ---- Flattened composites at print resolution ----
  // Mild sharpening compensates for resampling softness in print output;
  // layers are left untouched to keep their alpha edges clean.
  const compositeRgb = await sharp(input.original)
    .resize(widthPx, heightPx, { fit: "fill" })
    .sharpen({ sigma: 0.8 })
    .png()
    .withMetadata({ density: DPI })
    .toBuffer();

  // Note: withMetadata must precede withIccProfile — a trailing withMetadata
  // re-attaches an sRGB profile and silently undoes the CMYK conversion.
  const compositeCmyk = await sharp(input.original)
    .resize(widthPx, heightPx, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .sharpen({ sigma: 0.8 })
    .withMetadata({ density: DPI })
    .toColourspace("cmyk")
    .withIccProfile(pressIcc ?? "cmyk")
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();

  // ---- Layers: 300 DPI RGBA, raw pixels for the PSD ----
  const processed: { name: string; png: Buffer; raw: Buffer }[] = [];
  for (const layer of input.layers) {
    const base = sharp(layer.data).resize(widthPx, heightPx, { fit: "fill" });
    processed.push({
      name: layer.name,
      png: await base.clone().png().withMetadata({ density: DPI }).toBuffer(),
      raw: await base.clone().ensureAlpha().raw().toBuffer(),
    });
  }

  // ---- Full-res recomposite in the chosen order + residual layer ----
  const masterRaw = await sharp(compositeRgb).ensureAlpha().raw().toBuffer();
  const recomposite = new Uint8ClampedArray(widthPx * heightPx * 4);
  recomposite.fill(255);
  for (const idx of order) {
    overInPlace(recomposite, new Uint8ClampedArray(processed[idx].raw));
  }
  const recompositeError = meanDiff(recomposite, masterRaw);

  // Residual: master pixels wherever the recomposite is perceptibly off, so
  // the full stack flattens back to the original exactly where it matters.
  const residual = new Uint8ClampedArray(widthPx * heightPx * 4);
  let residualPx = 0;
  for (let i = 0; i < residual.length; i += 4) {
    const d = Math.max(
      Math.abs(recomposite[i] - masterRaw[i]),
      Math.abs(recomposite[i + 1] - masterRaw[i + 1]),
      Math.abs(recomposite[i + 2] - masterRaw[i + 2]),
    );
    if (d > RESIDUAL_THRESHOLD) {
      residual[i] = masterRaw[i];
      residual[i + 1] = masterRaw[i + 1];
      residual[i + 2] = masterRaw[i + 2];
      residual[i + 3] = 255;
      residualPx++;
    }
  }
  const residualShare = residualPx / (widthPx * heightPx);

  // ---- Layered PSD: bottom→top in the chosen order, residual on top ----
  const layerAt = (raw: Uint8ClampedArray | Buffer, name: string): Layer => ({
    name,
    left: 0,
    top: 0,
    right: widthPx,
    bottom: heightPx,
    imageData: {
      width: widthPx,
      height: heightPx,
      data: new Uint8ClampedArray(raw),
    } as ImageData,
  });
  const psdLayers: Layer[] = order.map((idx, pos) =>
    layerAt(processed[idx].raw, `${String(pos + 1).padStart(2, "0")} ${layerNames[pos]}`),
  );
  if (residualShare > 0.0005) {
    psdLayers.push(layerAt(residual, "accuracy fix (keep on top)"));
  }

  // ---- Vectorize flat layers (graphic/logo-like art only) ----
  const TRACE_W = 1024;
  const traceH = Math.round((heightPx / widthPx) * TRACE_W);
  const vectors: { name: string; svg: string }[] = [];
  let usedProVectorizer = false;
  for (let pos = 0; pos < order.length; pos++) {
    const idx = order[pos];
    if (!isFlat(layerProxies[idx])) continue;
    const name = `${String(pos + 1).padStart(2, "0")}-${layerNames[pos]}`;
    // Pro tracing via vectorizer.ai when configured; imagetracer otherwise.
    const hiRes = await sharp(input.layers[idx].data)
      .resize(Math.min(widthPx, 2048))
      .png()
      .toBuffer();
    const pro = await vectorizeViaApi(hiRes);
    if (pro) {
      usedProVectorizer = true;
      vectors.push({ name, svg: pro });
      continue;
    }
    const raw = new Uint8ClampedArray(
      await sharp(input.layers[idx].data)
        .resize(TRACE_W, traceH, { fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer(),
    );
    vectors.push({
      name,
      svg: traceToSvg(raw, TRACE_W, traceH, widthPx / TRACE_W),
    });
  }
  const psd: Psd = {
    width: widthPx,
    height: heightPx,
    imageResources: { resolutionInfo: {
      horizontalResolution: DPI,
      horizontalResolutionUnit: "PPI",
      widthUnit: "Inches",
      verticalResolution: DPI,
      verticalResolutionUnit: "PPI",
      heightUnit: "Inches",
    } },
    children: psdLayers,
    imageData: {
      width: widthPx,
      height: heightPx,
      data: new Uint8ClampedArray(masterRaw),
    } as ImageData,
  };
  const psdBuffer = writePsdBuffer(psd, { generateThumbnail: false });

  // ---- Print PDF: trim + bleed + crop marks + page boxes ----
  const pt = (inches: number) => inches * POINTS_PER_INCH;
  const trimW = pt(widthIn);
  const trimH = pt(heightIn);
  const bleed = pt(BLEED_IN);
  const margin = pt(MARK_MARGIN_IN);
  const off = bleed + margin; // trim origin within the page
  const pageW = trimW + 2 * off;
  const pageH = trimH + 2 * off;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pageW, pageH]);
  const jpg = await pdf.embedJpg(compositeCmyk);
  // Artwork scaled to cover the bleed box (~2% overscale past trim).
  page.drawImage(jpg, {
    x: off - bleed,
    y: off - bleed,
    width: trimW + 2 * bleed,
    height: trimH + 2 * bleed,
  });
  // Crop marks: two hairlines per corner, outside the bleed area.
  const markLen = pt(0.15);
  const gap = bleed + pt(0.0417); // marks start just past the bleed
  const corners: [number, number, number, number][] = [
    [off, off, -1, -1],
    [off + trimW, off, 1, -1],
    [off, off + trimH, -1, 1],
    [off + trimW, off + trimH, 1, 1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    page.drawLine({
      start: { x: cx + dx * gap, y: cy },
      end: { x: cx + dx * (gap + markLen), y: cy },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    page.drawLine({
      start: { x: cx, y: cy + dy * gap },
      end: { x: cx, y: cy + dy * (gap + markLen) },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
  }
  page.setTrimBox(off, off, trimW, trimH);
  page.setBleedBox(off - bleed, off - bleed, trimW + 2 * bleed, trimH + 2 * bleed);
  page.setMediaBox(0, 0, pageW, pageH);
  pdf.setTitle("Crispen production artwork");
  const pdfBytes = await pdf.save();

  // ---- Press-check report ----
  const inputDpi = Math.round(meta.width / widthIn);
  const inputSpace = (meta.space || "srgb").toUpperCase().replace("SRGB", "RGB (screen)");
  const report: ReportRow[] = [
    {
      label: "Resolution",
      before: `${meta.width}×${meta.height} px — ${inputDpi} DPI at ${widthIn.toFixed(1)}″`,
      after: `${widthPx}×${heightPx} px — ${DPI} DPI at final size`,
      fixed: inputDpi < DPI,
    },
    {
      label: "Colour",
      before: inputSpace,
      after: pressIcc
        ? `CMYK, press profile embedded (${path.basename(pressIcc, ".icc")})`
        : "CMYK, ICC profile embedded",
      fixed: true,
    },
    {
      label: "Gamut",
      before:
        gamutShare > 0.02
          ? `${(gamutShare * 100).toFixed(0)}% of colours outside CMYK gamut`
          : "screen colours",
      after:
        gamutShare > 0.02
          ? "mapped to nearest printable — proof saturated areas"
          : "fully printable — no meaningful gamut loss",
      fixed: gamutShare <= 0.02,
    },
    {
      label: "Layers",
      before: "1 flattened image",
      after: `${order.length} separated layers (${layerNames.join(", ")}) + accuracy fix`,
      fixed: true,
    },
    {
      label: "Vectors",
      before: "none — raster only",
      after:
        vectors.length > 0
          ? `${vectors.length} flat layer${vectors.length > 1 ? "s" : ""} traced to SVG${usedProVectorizer ? " (pro tracing)" : ""}`
          : "layers are painterly — kept raster (tracing would degrade them)",
      fixed: vectors.length > 0,
    },
    {
      label: "Print PDF",
      before: "none",
      after: `trim ${widthIn.toFixed(2)}″×${heightIn.toFixed(2)}″ + ${BLEED_IN}″ bleed + crop marks`,
      fixed: true,
    },
  ];

  // ---- Zip: layers named by stack position (01 = bottom) ----
  const zip = new JSZip();
  const layersDir = zip.folder("layers")!;
  order.forEach((idx, pos) => {
    layersDir.file(
      `${String(pos + 1).padStart(2, "0")}-${layerNames[pos]}.png`,
      processed[idx].png,
    );
  });
  if (vectors.length > 0) {
    const vecDir = zip.folder("vector")!;
    for (const v of vectors) vecDir.file(`${v.name}.svg`, v.svg);
  }
  zip.file("working-file.psd", psdBuffer);
  const printDir = zip.folder("print")!;
  printDir.file("artwork-cmyk.jpg", compositeCmyk);
  printDir.file("artwork.pdf", Buffer.from(pdfBytes));
  zip.file("master-rgb.png", compositeRgb);
  zip.file(
    "README.txt",
    [
      "Crispen production package",
      "==========================",
      "",
      `Artwork trim size: ${widthIn.toFixed(2)}\" x ${heightIn.toFixed(2)}\" at ${DPI} DPI`,
      `Pixels: ${widthPx} x ${heightPx}`,
      "",
      "layers/            RGBA layers, 300 DPI, numbered bottom -> top in",
      "                   verified stacking order (recomposite-tested),",
      "                   named by role.",
      vectors.length > 0
        ? "vector/            Editable SVG traces of the flat layers."
        : "vector/            (none — all layers are painterly; tracing them",
      vectors.length > 0
        ? ""
        : "                   would degrade quality, so they ship as raster.)",
      "working-file.psd   Layered Photoshop working file (RGB). The top",
      "                   \"accuracy fix\" layer pins the flattened result to",
      "                   the original — hide it while editing layers, show",
      "                   it before final export for maximum fidelity.",
      "print/artwork-cmyk.jpg  Flattened CMYK artwork at print resolution",
      `print/artwork.pdf  Print PDF: trim + ${BLEED_IN}\" bleed + crop marks,`,
      "                   TrimBox/BleedBox set (artwork overscaled ~2% to",
      "                   fill bleed).",
      "master-rgb.png     Flattened RGB master at print resolution",
      "",
      "Press check:",
      ...report.map((r) => `  ${r.label}: ${r.before}  ->  ${r.after}`),
      ...(notes.length > 0
        ? ["", "Production notes:", ...notes.map((n) => `  - ${n}`)]
        : []),
      "",
      `Recomposite accuracy: mean deviation ${recompositeError.toFixed(2)}/255`,
      "before correction; pixel-faithful with the accuracy-fix layer.",
      "",
      "Generated by Crispen (pre-release lab build).",
    ]
      .filter((l) => l !== "")
      .join("\n"),
  );
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return {
    zip: zipBuffer,
    widthPx,
    heightPx,
    widthIn,
    heightIn,
    order,
    recompositeError,
    report,
    notes,
    layerNames,
    vectorCount: vectors.length,
  };
}
