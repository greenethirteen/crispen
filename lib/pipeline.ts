// The /lab production pipeline: takes the original image + its RGBA layers,
// resamples everything to 300 DPI at the target print width, converts the
// flattened artwork to CMYK, and assembles a layered PSD, a print PDF and a
// zip package.

import sharp from "sharp";
import { writePsdBuffer, type Psd, type Layer } from "ag-psd";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

const DPI = 300;
const POINTS_PER_INCH = 72;

export interface PackageInput {
  original: Buffer;
  layers: { name: string; data: Buffer }[];
  targetWidthInches: number;
}

export interface PackageResult {
  zip: Buffer;
  widthPx: number;
  heightPx: number;
  widthIn: number;
  heightIn: number;
}

/** Resize to the target pixel width (300 DPI at print size), keep alpha. */
async function resampleLayer(
  data: Buffer,
  widthPx: number,
  heightPx: number,
): Promise<{ png: Buffer; raw: Buffer }> {
  const base = sharp(data).resize(widthPx, heightPx, { fit: "fill" });
  const png = await base
    .clone()
    .png()
    .withMetadata({ density: DPI })
    .toBuffer();
  const raw = await base.clone().ensureAlpha().raw().toBuffer();
  return { png, raw };
}

export async function buildPackage(input: PackageInput): Promise<PackageResult> {
  const meta = await sharp(input.original).metadata();
  if (!meta.width || !meta.height) throw new Error("Cannot read image size");

  const widthPx = Math.round(input.targetWidthInches * DPI);
  const heightPx = Math.round((meta.height / meta.width) * widthPx);
  const widthIn = input.targetWidthInches;
  const heightIn = heightPx / DPI;

  // ---- Flattened composite: 300 DPI, CMYK JPEG ----
  // Note: withMetadata must precede withIccProfile — a trailing withMetadata
  // re-attaches an sRGB profile and silently undoes the CMYK conversion.
  const compositeCmyk = await sharp(input.original)
    .resize(widthPx, heightPx, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .withMetadata({ density: DPI })
    .toColourspace("cmyk")
    .withIccProfile("cmyk")
    .jpeg({ quality: 95 })
    .toBuffer();

  // Also an RGB PNG master at print resolution.
  const compositeRgb = await sharp(input.original)
    .resize(widthPx, heightPx, { fit: "fill" })
    .png()
    .withMetadata({ density: DPI })
    .toBuffer();

  // ---- Layers: 300 DPI RGBA PNGs + raw pixels for the PSD ----
  const processed = [] as { name: string; png: Buffer; raw: Buffer }[];
  for (const layer of input.layers) {
    const { png, raw } = await resampleLayer(layer.data, widthPx, heightPx);
    processed.push({ name: layer.name, png, raw });
  }

  // ---- Layered PSD (RGB working file; CMYK deliverables ride alongside) ----
  const psdLayers: Layer[] = processed.map((l) => ({
    name: l.name,
    left: 0,
    top: 0,
    right: widthPx,
    bottom: heightPx,
    imageData: {
      width: widthPx,
      height: heightPx,
      data: new Uint8ClampedArray(l.raw),
    } as ImageData,
  }));
  const compositeRaw = await sharp(compositeRgb).ensureAlpha().raw().toBuffer();
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
      data: new Uint8ClampedArray(compositeRaw),
    } as ImageData,
  };
  const psdBuffer = writePsdBuffer(psd, { generateThumbnail: false });

  // ---- Print PDF: page at exact trim size, CMYK artwork full-bleed ----
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([
    widthIn * POINTS_PER_INCH,
    heightIn * POINTS_PER_INCH,
  ]);
  const jpg = await pdf.embedJpg(compositeCmyk);
  page.drawImage(jpg, {
    x: 0,
    y: 0,
    width: widthIn * POINTS_PER_INCH,
    height: heightIn * POINTS_PER_INCH,
  });
  pdf.setTitle("Crispen production artwork");
  const pdfBytes = await pdf.save();

  // ---- Zip it all up ----
  const zip = new JSZip();
  const layersDir = zip.folder("layers")!;
  processed.forEach((l, i) => {
    layersDir.file(`${String(i + 1).padStart(2, "0")}-${l.name}.png`, l.png);
  });
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
      `Artwork size: ${widthIn.toFixed(2)}\" x ${heightIn.toFixed(2)}\" at ${DPI} DPI`,
      `Pixels: ${widthPx} x ${heightPx}`,
      "",
      "layers/            RGBA layers, 300 DPI (separated by AI)",
      "working-file.psd   Layered Photoshop working file (RGB)",
      "print/artwork-cmyk.jpg  Flattened CMYK artwork at print resolution",
      "print/artwork.pdf  Print PDF at exact trim size (CMYK)",
      "master-rgb.png     Flattened RGB master at print resolution",
      "",
      "Generated by Crispen (pre-release lab build).",
    ].join("\n"),
  );
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return { zip: zipBuffer, widthPx, heightPx, widthIn, heightIn };
}
