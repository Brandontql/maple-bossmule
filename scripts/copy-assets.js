// Copies non-TS renderer assets (HTML/CSS) into dist so Electron can load them
// alongside the compiled JS. Runs after `tsc` in the build script.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcRenderer = path.join(root, "src", "renderer");
const distRenderer = path.join(root, "dist", "renderer");

fs.mkdirSync(distRenderer, { recursive: true });

for (const file of fs.readdirSync(srcRenderer)) {
  if (file.endsWith(".html") || file.endsWith(".css")) {
    fs.copyFileSync(path.join(srcRenderer, file), path.join(distRenderer, file));
    console.log(`copied ${file} -> dist/renderer/${file}`);
  }
}
