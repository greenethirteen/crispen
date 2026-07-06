// Pipeline v3 test against the user's real conversion (Crispen chips bag).
// Run: npx tsx scripts/test-pipeline-real.ts
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { buildPackage } from "../lib/pipeline";

const D =
  "/private/tmp/claude-501/-Users-greenethirteen-repro/a46d80b0-6d2f-4305-9c71-628b0f299dfe/scratchpad/user-test";

async function main() {
  const t0 = Date.now();
  const result = await buildPackage({
    original: readFileSync(`${D}/master-rgb.png`),
    layers: [1, 2, 3, 4].map((i) => ({
      name: `layer-${i}`,
      data: readFileSync(`${D}/layers/0${i}-layer-${i}.png`),
    })),
    targetWidthInches: 12,
  });
  console.log(`built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`order (bottom→top): ${result.order.map((i) => i + 1).join(",")}`);
  console.log(`layer names: ${result.layerNames.join(", ")}`);
  console.log(`recomposite error: ${result.recompositeError.toFixed(2)}/255`);
  console.log(`vectors traced: ${result.vectorCount}`);
  console.log("report:");
  for (const r of result.report) {
    console.log(`  [${r.fixed ? "FIXED" : "ok"}] ${r.label}: ${r.before} -> ${r.after}`);
  }
  mkdirSync(`${D}/v3`, { recursive: true });
  writeFileSync(`${D}/v3/package-v3.zip`, result.zip);
  console.log(`zip: ${(result.zip.length / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
