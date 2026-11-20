// Requires Playwright (npm i -D playwright). Dev-only: renders public/icon.svg and public/icon-maskable.svg to the PNG sizes the manifest needs.
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');

const jobs = [
  ['public/icon.svg', 'public/icon-192.png', 192],
  ['public/icon.svg', 'public/icon-512.png', 512],
  ['public/icon.svg', 'public/apple-touch-icon.png', 180],
  ['public/icon-maskable.svg', 'public/icon-maskable-512.png', 512],
];

(async () => {
  const browser = await chromium.launch();
  for (const [src, out, size] of jobs) {
    const svg = readFileSync(src, 'utf8');
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body>`);
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
