// Local end-to-end test of lib/pipeline.ts with synthetic layers (no GPU).
// Run: npx tsx scripts/test-pipeline.ts <outDir>
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { buildPackage } from "../lib/pipeline";

async function blob(w: number, h: number, rgba: string, bg = false) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    ${bg ? `<rect width="100%" height="100%" fill="#1a1920"/>` : ""}
    <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="${rgba}"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const outDir = process.argv[2] || ".pipeline-test";
  mkdirSync(outDir, { recursive: true });
  const W = 800;
  const H = 600;

  const original = await blob(W, H, "#ff9500", true);
  const layers = [
    { name: "background", data: await blob(W, H, "#1a1920", true) },
    { name: "subject", data: await blob(W, H, "rgba(255,149,0,1)") },
    { name: "accent", data: await blob(W, H, "rgba(0,174,239,0.9)") },
  ];

  const t0 = Date.now();
  const result = await buildPackage({
    original,
    layers,
    targetWidthInches: 12,
  });
  console.log(
    `buildPackage ok in ${Date.now() - t0}ms — ${result.widthPx}x${result.heightPx}px (${result.widthIn}"x${result.heightIn.toFixed(2)}")`,
  );
  const zipPath = join(outDir, "production-package.zip");
  writeFileSync(zipPath, result.zip);
  console.log(`wrote ${zipPath} (${(result.zip.length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
