import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requireFromWorker = createRequire(new URL("../../worker/package.json", import.meta.url));
const { chromium } = requireFromWorker("playwright");

const root = resolve(new URL("..", import.meta.url).pathname);
const source = resolve(root, "store-assets/promo-tile.html");
const outDir = resolve(root, "store-assets/generated");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 440, height: 280 },
  deviceScaleFactor: 1,
});

await page.goto(pathToFileURL(source).href, { waitUntil: "networkidle" });
await page.screenshot({
  path: resolve(outDir, "jobposted-promo-tile-440x280.png"),
  fullPage: false,
  type: "png",
});
await page.screenshot({
  path: resolve(outDir, "jobposted-promo-tile-440x280.jpg"),
  fullPage: false,
  type: "jpeg",
  quality: 96,
});

await browser.close();

console.log(`Rendered promo tile to ${outDir}`);
