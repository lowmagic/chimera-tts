// Renders public/icon.svg to the PNG icons the manifest and iOS want. Run by hand after changing
// the SVG: `node scripts/make-icons.cjs` (needs Playwright with Chromium).
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const pub = path.join(__dirname, "..", "public");
const svg = fs.readFileSync(path.join(pub, "icon.svg"), "utf8");
// [file, size, padding]: a maskable icon keeps its drawing inside the middle 80 %; iOS rounds
// the corners itself, so its icon is a full square
const icons = [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["icon-maskable-512.png", 512, 0.1], ["icon-180.png", 180, 0.04]];

(async () => {
  const browser = await chromium.launch();
  for (const [file, size, pad] of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const inner = Math.round(size * (1 - 2 * pad));
    await page.setContent(`<body style="margin:0;background:${pad ? "#0b0f0c" : "transparent"};display:grid;place-items:center;height:100vh"><div style="width:${inner}px;height:${inner}px">${svg}</div></body>`);
    await page.screenshot({ path: path.join(pub, file), omitBackground: !pad });
    await page.close();
  }
  await browser.close();
})();
