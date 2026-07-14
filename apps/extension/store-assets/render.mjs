import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requireFromWorker = createRequire(new URL("../../worker/package.json", import.meta.url));
const { chromium } = requireFromWorker("playwright");

const root = resolve(new URL("..", import.meta.url).pathname);
const source = resolve(root, "store-assets/source.html");
const outDir = resolve(root, "store-assets/generated");

const slides = [
  { id: "1", name: "jobposted-store-1-autofill" },
  { id: "2", name: "jobposted-store-2-tailor-resume" },
  { id: "3", name: "jobposted-store-3-match-tracker" },
  { id: "4", name: "jobposted-store-4-job-tracker" },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});

for (const slide of slides) {
  const url = `${pathToFileURL(source).href}?slide=${slide.id}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({
    path: resolve(outDir, `${slide.name}.png`),
    fullPage: false,
    type: "png",
  });
  await page.screenshot({
    path: resolve(outDir, `${slide.name}.jpg`),
    fullPage: false,
    type: "jpeg",
    quality: 94,
  });
}

await browser.close();

console.log(`Rendered ${slides.length} Chrome Store screenshots to ${outDir}`);
