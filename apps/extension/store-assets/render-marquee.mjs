import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requireFromWorker = createRequire(new URL("../../worker/package.json", import.meta.url));
const { chromium } = requireFromWorker("playwright");

const root = resolve(new URL("..", import.meta.url).pathname);
const source = resolve(root, "store-assets/marquee-promo.html");
const outDir = resolve(root, "store-assets/generated");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 560 },
  deviceScaleFactor: 1,
});

await page.goto(pathToFileURL(source).href, { waitUntil: "networkidle" });
await page.screenshot({
  path: resolve(outDir, "jobposted-marquee-promo-1400x560.png"),
  fullPage: false,
  type: "png",
});
await page.screenshot({
  path: resolve(outDir, "jobposted-marquee-promo-1400x560.jpg"),
  fullPage: false,
  type: "jpeg",
  quality: 94,
});

await browser.close();

console.log(`Rendered marquee promo tile to ${outDir}`);
