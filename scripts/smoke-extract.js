// Dev smoke harness — NOT part of the app. Runs the real extraction pipeline
// (cropToTooltip -> active OcrEngine.extract) against a local image file, the
// same path the IPC `extract` handler uses, and prints the EquipmentData JSON.
//
//   npm run build           # produce dist/ first
//   node scripts/smoke-extract.js <image-path> [engineId]
//
// engineId defaults to "vision-llm"; "tesseract" and "stub" also work.
// The vision engine reads ANTHROPIC_API_KEY from the environment.

const fs = require("fs");
const path = require("path");
const { extractEquipment, setActiveEngine, listEngines } = require("../dist/ocr");

function mimeFor(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

async function main() {
  const file = process.argv[2];
  const engineId = process.argv[3] || "vision-llm";
  if (!file) {
    console.error("usage: node scripts/smoke-extract.js <image-path> [engineId]");
    process.exit(2);
  }

  const abs = path.resolve(file);
  const image = fs.readFileSync(abs);
  const mimeType = mimeFor(abs);

  console.error(`Available engines: ${listEngines().map((e) => e.id).join(", ")}`);
  console.error(`Engine: ${engineId}  |  File: ${abs}  |  ${image.length} bytes  |  ${mimeType}`);

  setActiveEngine(engineId);

  const started = Date.now();
  const data = await extractEquipment({ image, mimeType });
  console.error(`Extracted in ${Date.now() - started} ms`);

  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(`ERROR: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
