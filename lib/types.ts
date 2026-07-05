export type CheckStatus = "pass" | "fail" | "warn" | "info";

export interface CheckRow {
  id: string;
  label: string;
  status: CheckStatus;
  value: string;
  detail: string;
}

export interface ImageMeta {
  fileName: string;
  fileSizeBytes: number;
  format: string; // png | jpeg | webp
  width: number; // px
  height: number; // px
  hasAlpha: boolean;
  colorSpace: string; // srgb | cmyk | etc.
  channels: number;
  density: number | null; // embedded DPI, if any
}

export interface AnalyzeResponse {
  meta: ImageMeta;
  // Whether the raster is flat/simple enough to attempt vector tracing.
  vectorizable: boolean;
  vectorizableReason: string;
}
