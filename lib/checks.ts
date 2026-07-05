import type { CheckRow, ImageMeta } from "./types";

export type PrintUnit = "in" | "cm";

export interface PrintSize {
  width: number;
  height: number;
  unit: PrintUnit;
}

const MIN_PRINT_DPI = 150;
const CM_PER_INCH = 2.54;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function toInches(value: number, unit: PrintUnit): number {
  return unit === "in" ? value : value / CM_PER_INCH;
}

/**
 * Effective DPI = pixel dimension / intended physical dimension (inches).
 * We report the limiting (smaller) axis, since that's what pixelates first.
 */
export function effectiveDpi(
  meta: ImageMeta,
  print: PrintSize,
): number | null {
  const wIn = toInches(print.width, print.unit);
  const hIn = toInches(print.height, print.unit);
  if (wIn <= 0 || hIn <= 0) return null;
  const dpiW = meta.width / wIn;
  const dpiH = meta.height / hIn;
  return Math.min(dpiW, dpiH);
}

/**
 * Build the full reject report. Print size is optional — without it we can't
 * compute effective DPI, so that row reports "info" instead of pass/fail.
 */
export function buildReport(
  meta: ImageMeta,
  print: PrintSize | null,
): CheckRow[] {
  const rows: CheckRow[] = [];

  // 1. Resolution / effective DPI
  if (print) {
    const dpi = effectiveDpi(meta, print);
    if (dpi === null) {
      rows.push({
        id: "resolution",
        label: "Resolution / DPI",
        status: "info",
        value: "—",
        detail: "Enter a valid print size to calculate effective DPI.",
      });
    } else {
      const pass = dpi >= MIN_PRINT_DPI;
      rows.push({
        id: "resolution",
        label: "Resolution / DPI",
        status: pass ? "pass" : "fail",
        value: `${Math.round(dpi)} DPI`,
        detail: pass
          ? `At ${print.width}×${print.height} ${print.unit}, this holds ${Math.round(
              dpi,
            )} DPI — above the ${MIN_PRINT_DPI} DPI print floor.`
          : `At ${print.width}×${print.height} ${print.unit}, this drops to ${Math.round(
              dpi,
            )} DPI. Below ${MIN_PRINT_DPI} DPI it will pixelate in print.`,
      });
    }
  } else {
    rows.push({
      id: "resolution",
      label: "Resolution / DPI",
      status: "info",
      value: `${meta.width}×${meta.height} px`,
      detail:
        "Enter an intended print size to calculate effective DPI and flag pixelation.",
    });
  }

  // 2. Color mode — sharp reports the color space directly.
  const isCmyk = meta.colorSpace.toLowerCase() === "cmyk";
  rows.push({
    id: "colormode",
    label: "Color Mode",
    status: isCmyk ? "pass" : "warn",
    value: meta.colorSpace.toUpperCase(),
    detail: isCmyk
      ? "Already CMYK — print-safe color space."
      : "RGB / screen color space. Not print-safe; needs CMYK conversion at prepress (approximate only in this tool).",
  });

  // 3. Transparency / alpha channel
  rows.push({
    id: "alpha",
    label: "Transparency",
    status: "info",
    value: meta.hasAlpha ? "Alpha present" : "No alpha",
    detail: meta.hasAlpha
      ? "Image carries an alpha channel. Confirm the background is intended to knock out over other elements."
      : "No alpha channel — image is fully opaque with a baked-in background.",
  });

  // 4. File size / dimensions sanity check
  const tiny = meta.width < 500 || meta.height < 500;
  const huge = meta.fileSizeBytes > 20 * 1024 * 1024;
  let sanityStatus: CheckRow["status"] = "pass";
  let sanityDetail =
    "Dimensions and file size are within a sensible range for production.";
  if (tiny) {
    sanityStatus = "warn";
    sanityDetail = `Small source (${meta.width}×${meta.height} px). Limited headroom for scaling up before print.`;
  } else if (huge) {
    sanityStatus = "warn";
    sanityDetail = `Large file (${formatBytes(meta.fileSizeBytes)}). Fine to print, but heavy to hand off.`;
  }
  rows.push({
    id: "sanity",
    label: "Dimensions / Size",
    status: sanityStatus,
    value: `${meta.width}×${meta.height} · ${formatBytes(meta.fileSizeBytes)}`,
    detail: sanityDetail,
  });

  return rows;
}
