const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const WIDTH = 1280;
const HEIGHT = 800;
const ROOT = path.resolve(__dirname, "../../..");
const generatedPath = path.join(ROOT, "extension/store-assets/generated/jobposted-store-3-match-tracker.png");
const generatedJpgPath = path.join(ROOT, "extension/store-assets/generated/jobposted-store-3-match-tracker.jpg");
const svgPath = path.join(ROOT, "extension/store-assets/generated/jobposted-store-3-match-tracker.svg");
const downloadsPath = "/Users/dr.chandinibuddha/Downloads/Match tracker screenshot.png";

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function t({ x, y, text, size = 14, weight = 700, fill = "#111827", anchor = "start", opacity = 1 }) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${esc(text)}</text>`;
}

function rect({ x, y, w, h, r = 18, fill = "#fff", stroke = "none", sw = 1, filter = "" }) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${filter ? `filter="${filter}"` : ""}/>`;
}

function pill(x, y, label, w = null) {
  const width = w ?? Math.max(124, label.length * 7.4 + 36);
  return `
    ${rect({ x, y, w: width, h: 34, r: 17, fill: "#ffffff", stroke: "#b9d8ff" })}
    <circle cx="${x + 18}" cy="${y + 17}" r="4" fill="#2fd6bd"/>
    ${t({ x: x + 30, y: y + 22, text: label, size: 14, weight: 800, fill: "#1354c8" })}
  `;
}

function jobPostedShield(x, y, size = 34) {
  const s = size / 34;
  return `
    <g transform="translate(${x} ${y}) scale(${s})">
      <path d="M17 2l14 4v10c0 8.6-5.6 14.9-14 17C8.6 30.9 3 24.6 3 16V6l14-4z" fill="#1e6bff"/>
      <path d="M15 8h10v4h-6v9.1c0 4.3-2.8 7-7.2 7-2.4 0-4.6-.8-6.1-2.2l2.8-3.2c.8.8 1.8 1.2 2.9 1.2 1.9 0 3.1-1.2 3.1-3.4V12H15V8z" fill="#ffffff"/>
      <path d="M22.2 5.1h7.3l-5.6 4.2h-7.3l5.6-4.2z" fill="#b7e1ff"/>
    </g>
  `;
}

function companyLogo(kind, x, y, size = 40) {
  const s = size;
  const cx = x + s / 2;
  const cy = y + s / 2;
  if (kind === "mosaic") {
    const tile = Math.max(7, s * 0.24);
    const gap = Math.max(3, s * 0.09);
    const start = x + (s - tile * 2 - gap) / 2;
    return `
      ${rect({ x, y, w: s, h: s, r: 12, fill: "#eef7ff" })}
      <rect x="${start}" y="${start - x + y}" width="${tile}" height="${tile}" rx="2.5" fill="#2563eb"/>
      <rect x="${start + tile + gap}" y="${start - x + y}" width="${tile}" height="${tile}" rx="2.5" fill="#14b8a6"/>
      <rect x="${start}" y="${start - x + y + tile + gap}" width="${tile}" height="${tile}" rx="2.5" fill="#06b6d4"/>
      <rect x="${start + tile + gap}" y="${start - x + y + tile + gap}" width="${tile}" height="${tile}" rx="2.5" fill="#f59e0b"/>
    `;
  }
  if (kind === "aster") {
    return `
      ${rect({ x, y, w: s, h: s, r: 12, fill: "#f0f8ff" })}
      <path d="M${cx} ${y + 8}v24M${x + 8} ${cy}h24M${x + 11} ${y + 11}l18 18M${x + 29} ${y + 11}l-18 18" stroke="#22b874" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="5" fill="#2563eb"/>
    `;
  }
  if (kind === "orbit") {
    return `
      ${rect({ x, y, w: s, h: s, r: 12, fill: "#eefdf8" })}
      <ellipse cx="${cx}" cy="${cy}" rx="${s * 0.34}" ry="${s * 0.18}" transform="rotate(-28 ${cx} ${cy})" fill="none" stroke="#0fba98" stroke-width="3.2"/>
      <circle cx="${cx + s * 0.22}" cy="${cy - s * 0.20}" r="${s * 0.10}" fill="#1363ff"/>
    `;
  }
  return `
    ${rect({ x, y, w: s, h: s, r: 12, fill: "#eef4ff" })}
    <path d="M${x + 8} ${y + 29}l10-18 6 9 5-7 7 16H${x + 8}z" fill="#235dce"/>
  `;
}

function scoreRing(cx, cy, value) {
  return `
    <circle cx="${cx}" cy="${cy}" r="37" fill="#ffffff" stroke="#d9e7fb" stroke-width="7"/>
    <path d="M${cx} ${cy - 37}a37 37 0 1 1 -19.2 68.6" fill="none" stroke="#2768e8" stroke-width="7" stroke-linecap="round"/>
    ${t({ x: cx, y: cy + 9, text: value, size: 27, weight: 900, fill: "#0b1224", anchor: "middle" })}
  `;
}

function metricCard(x, y, percent, label) {
  return `
    ${rect({ x, y, w: 123, h: 73, r: 14, fill: "#f6faff" })}
    ${t({ x: x + 61.5, y: y + 35, text: percent, size: 21, weight: 900, fill: "#1354c8", anchor: "middle" })}
    ${t({ x: x + 61.5, y: y + 56, text: label, size: 11, weight: 800, fill: "#526178", anchor: "middle" })}
  `;
}

function tab(x, label, active = false) {
  return `
    ${active ? rect({ x, y: 431, w: 84, h: 31, r: 12, fill: "#ffffff" }) : ""}
    ${t({ x: x + 42, y: 452, text: label, size: 11.2, weight: 900, fill: active ? "#1354c8" : "#526178", anchor: "middle" })}
  `;
}

function statusPill(x, y, label) {
  const w = Math.max(54, label.length * 6.4 + 18);
  return `
    ${rect({ x, y, w, h: 26, r: 13, fill: "#edf3fb" })}
    ${t({ x: x + w / 2, y: y + 17.5, text: label, size: 10.8, weight: 900, fill: "#526178", anchor: "middle" })}
  `;
}

function trackerRow({ y, logo, title, company, status }) {
  return `
    ${rect({ x: 662, y, w: 354, h: 64, r: 15, fill: "#ffffff", stroke: "#c1dcff" })}
    ${companyLogo(logo, 674, y + 12, 40)}
    ${t({ x: 723, y: y + 29, text: title, size: 13.2, weight: 900, fill: "#111827" })}
    ${t({ x: 723, y: y + 46, text: company, size: 11, weight: 800, fill: "#56657a" })}
    ${statusPill(954, y + 19, status)}
  `;
}

function svg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#f4faff"/>
      <stop offset="1" stop-color="#d7eff8"/>
    </linearGradient>
    <radialGradient id="aqua" cx="52%" cy="78%" r="52%">
      <stop offset="0" stop-color="#b9f4ea" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#b9f4ea" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#2e5d94" flood-opacity="0.20"/>
    </filter>
    <filter id="softShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="12" stdDeviation="15" flood-color="#2e5d94" flood-opacity="0.14"/>
    </filter>
    <style>
      text { font-family: Arial, Helvetica, sans-serif; }
    </style>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#aqua)"/>

  ${rect({ x: 70, y: 129, w: 66, h: 66, r: 18, fill: "#f8fbff", stroke: "#bfd9ff", sw: 2, filter: "url(#softShadow)" })}
  <path d="M91 170h24M93 169l8-8 6 5 10-13M115 153v8h-8" fill="none" stroke="#2768e8" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>

  ${t({ x: 70, y: 286, text: "Find better fits,", size: 68, weight: 900, fill: "#0b1224" })}
  ${t({ x: 70, y: 356, text: "then", size: 68, weight: 900, fill: "#0b1224" })}
  <rect x="72" y="417" width="521" height="14" rx="7" fill="#aee7ee"/>
  ${t({ x: 70, y: 426, text: "track every step.", size: 68, weight: 900, fill: "#0b1224" })}

  ${t({ x: 70, y: 490, text: "See why a role matches, save it from the", size: 28, weight: 500, fill: "#243249" })}
  ${t({ x: 70, y: 525, text: "page, and keep your application", size: 28, weight: 500, fill: "#243249" })}
  ${t({ x: 70, y: 560, text: "pipeline organized.", size: 28, weight: 500, fill: "#243249" })}

  ${pill(70, 607, "Fit signals")}
  ${pill(197, 607, "Saved tracker")}
  ${pill(346, 607, "Status updates")}
  <circle cx="80" cy="675" r="10" fill="#2768e8"/>
  ${t({ x: 80, y: 680, text: "✓", size: 13, weight: 900, fill: "#ffffff", anchor: "middle" })}
  ${t({ x: 99, y: 681, text: "Nothing is submitted without review", size: 16, weight: 900, fill: "#1354c8" })}

  ${rect({ x: 775, y: 168, w: 439, h: 390, r: 23, fill: "#ffffff", stroke: "#b5d5ff", filter: "url(#shadow)" })}
  ${rect({ x: 1038, y: 101, w: 174, h: 45, r: 22.5, fill: "#ffffff", stroke: "#b8d6ff", filter: "url(#softShadow)" })}
  ${jobPostedShield(1055, 112, 22)}
  ${t({ x: 1087, y: 129, text: "JobPosted match", size: 14, weight: 900, fill: "#1354c8" })}

  ${companyLogo("mosaic", 800, 211, 43)}
  ${t({ x: 870, y: 231, text: "Senior Data Analyst", size: 21, weight: 900, fill: "#0b1224" })}
  ${t({ x: 870, y: 252, text: "Mosaic Systems - 1 hour ago", size: 12.5, weight: 800, fill: "#526178" })}
  ${scoreRing(1150, 233, "92%")}
  ${metricCard(800, 302, "96%", "Experience")}
  ${metricCard(933, 302, "90%", "Skills")}
  ${metricCard(1066, 302, "88%", "Industry")}

  ${rect({ x: 645, y: 365, w: 387, h: 342, r: 22, fill: "#ffffff", stroke: "#b9d8ff", filter: "url(#shadow)" })}
  ${t({ x: 662, y: 404, text: "Application tracker", size: 17, weight: 900, fill: "#0b1224" })}
  ${rect({ x: 917, y: 382, w: 99, h: 32, r: 16, fill: "#eff6ff" })}
  ${t({ x: 936, y: 404, text: "+", size: 21, weight: 800, fill: "#1354c8" })}
  ${t({ x: 955, y: 402, text: "Save job", size: 12.2, weight: 900, fill: "#1354c8" })}
  ${rect({ x: 662, y: 426, w: 354, h: 40, r: 13, fill: "#eff6ff" })}
  ${tab(666, "Saved", true)}
  ${tab(746, "Applied")}
  ${tab(837, "Interview")}
  ${tab(928, "Offer")}

  ${trackerRow({ y: 478, logo: "mosaic", title: "Senior Data Analyst", company: "Mosaic Systems", status: "Saved" })}
  ${trackerRow({ y: 552, logo: "aster", title: "Product Analyst", company: "Aster Health", status: "Applied" })}
  ${trackerRow({ y: 626, logo: "orbit", title: "Growth Data Lead", company: "Orbit Finance", status: "Interview" })}

  ${rect({ x: 1041, y: 664, w: 191, h: 44, r: 22, fill: "#ffffff", stroke: "#b8d6ff", filter: "url(#softShadow)" })}
  <path d="M1068 675l3.2 7.9 8 3-8 3.2-3.2 7.9-3.3-7.9-7.9-3.2 7.9-3 3.3-7.9z" fill="none" stroke="#2768e8" stroke-width="2.1" stroke-linejoin="round"/>
  ${t({ x: 1089, y: 691, text: "Review queue ready", size: 14, weight: 900, fill: "#1354c8" })}
</svg>`;
}

async function main() {
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  const svgContent = svg();
  fs.writeFileSync(svgPath, svgContent, "utf8");
  const rendered = sharp(Buffer.from(svgContent));
  const png = await rendered.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const jpg = await rendered.clone().jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  fs.writeFileSync(generatedPath, png);
  fs.writeFileSync(generatedJpgPath, jpg);
  fs.writeFileSync(downloadsPath, png);
  console.log(`Wrote ${generatedPath}`);
  console.log(`Wrote ${generatedJpgPath}`);
  console.log(`Wrote ${svgPath}`);
  console.log(`Wrote ${downloadsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
