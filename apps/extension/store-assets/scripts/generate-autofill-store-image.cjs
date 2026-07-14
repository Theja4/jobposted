const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const WIDTH = 1280;
const HEIGHT = 800;
const ROOT = path.resolve(__dirname, "../../..");
const generatedPath = path.join(ROOT, "extension/store-assets/generated/jobposted-store-1-autofill.png");
const generatedJpgPath = path.join(ROOT, "extension/store-assets/generated/jobposted-store-1-autofill.jpg");
const svgPath = path.join(ROOT, "extension/store-assets/generated/jobposted-store-1-autofill.svg");
const jobPostedIconPath = path.join(ROOT, "extension/store-assets/generated/jobposted-icon-128.png");
const downloadsPath = "/Users/dr.chandinibuddha/Downloads/Autofill screenshot.png";

const JOBPOSTED_ICON_URI = `data:image/png;base64,${fs.readFileSync(jobPostedIconPath).toString("base64")}`;

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
  const width = w ?? Math.max(98, label.length * 7.8 + 36);
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

function northstarLogo(x, y, size = 40) {
  const cx = x + size / 2;
  return `
    ${rect({ x, y, w: size, h: size, r: 12, fill: "#e8f2ff" })}
    <path d="M${cx} ${y + 8}l3.1 8.2 8.3 2.7-8.1 3.1-3.3 8.2-3.3-8.2-8.1-3.1 8.3-2.7L${cx} ${y + 8}z" fill="#1f6fff"/>
  `;
}

function checkRow(x, y, label) {
  return `
    ${rect({ x, y, w: 350, h: 34, r: 11, fill: "#f4f8ff" })}
    ${t({ x: x + 12, y: y + 22, text: label, size: 12.4, weight: 800, fill: "#2b3a55" })}
    <circle cx="${x + 331}" cy="${y + 17}" r="10" fill="#e5f9ef"/>
    ${t({ x: x + 331, y: y + 22, text: "✓", size: 13, weight: 900, fill: "#07a65a", anchor: "middle" })}
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

  ${t({ x: 70, y: 255, text: "Autofill", size: 66, weight: 900, fill: "#0b1224" })}
  ${t({ x: 70, y: 322, text: "applications.", size: 66, weight: 900, fill: "#0b1224" })}
  <rect x="72" y="383" width="500" height="14" rx="7" fill="#aee7ee"/>
  ${t({ x: 70, y: 392, text: "You stay in control.", size: 60, weight: 900, fill: "#0b1224" })}

  ${t({ x: 70, y: 457, text: "Fill login-gated job forms inside your", size: 28, weight: 500, fill: "#243249" })}
  ${t({ x: 70, y: 492, text: "own browser session, then review", size: 28, weight: 500, fill: "#243249" })}
  ${t({ x: 70, y: 527, text: "before anything is submitted.", size: 28, weight: 500, fill: "#243249" })}

  ${pill(70, 575, "Workday")}
  ${pill(191, 575, "Greenhouse", 130)}
  ${pill(337, 575, "Lever")}
  ${pill(452, 575, "Ashby")}
  ${pill(70, 619, "iCIMS", 80)}
  ${pill(163, 619, "Workable", 108)}

  <g transform="translate(660 109) rotate(-2 226 292)">
    ${rect({ x: 0, y: 0, w: 453, h: 576, r: 22, fill: "#ffffff", stroke: "#c1dcff", filter: "url(#shadow)" })}
    <line x1="0" y1="54" x2="453" y2="54" stroke="#dbe9fb"/>
    <circle cx="28" cy="29" r="4.5" fill="#bccae0"/>
    <circle cx="44" cy="29" r="4.5" fill="#bccae0"/>
    <circle cx="60" cy="29" r="4.5" fill="#bccae0"/>
    ${rect({ x: 30, y: 78, w: 166, h: 31, r: 15.5, fill: "#e7fbef" })}
    <circle cx="47" cy="94" r="4" fill="#18b487"/>
    ${t({ x: 63, y: 99, text: "Application detected", size: 14, weight: 900, fill: "#078265" })}
    ${t({ x: 32, y: 150, text: "Product Manager", size: 26, weight: 900, fill: "#0b1224" })}
    ${t({ x: 32, y: 176, text: "Remote - Full time - Senior", size: 14, weight: 800, fill: "#526178" })}
    ${t({ x: 32, y: 218, text: "Full name", size: 12.5, weight: 900, fill: "#33415b" })}
    ${rect({ x: 32, y: 226, w: 372, h: 37, r: 12, fill: "#f8fbff", stroke: "#bfd9ff" })}
    <rect x="48" y="244" width="267" height="7" rx="3.5" fill="#bfd4f3"/>
    ${t({ x: 32, y: 292, text: "Email", size: 12.5, weight: 900, fill: "#33415b" })}
    ${rect({ x: 32, y: 300, w: 372, h: 37, r: 12, fill: "#f8fbff", stroke: "#bfd9ff" })}
    <rect x="48" y="318" width="245" height="7" rx="3.5" fill="#bfd4f3"/>
    ${t({ x: 32, y: 366, text: "Work authorization", size: 12.5, weight: 900, fill: "#33415b" })}
    ${rect({ x: 32, y: 374, w: 372, h: 37, r: 12, fill: "#f8fbff", stroke: "#bfd9ff" })}
    <rect x="48" y="392" width="205" height="7" rx="3.5" fill="#bfd4f3"/>
    ${t({ x: 32, y: 440, text: "Resume", size: 12.5, weight: 900, fill: "#33415b" })}
    ${rect({ x: 32, y: 448, w: 372, h: 37, r: 12, fill: "#f8fbff", stroke: "#bfd9ff" })}
  </g>

  ${rect({ x: 862, y: 84, w: 384, h: 533, r: 20, fill: "#ffffff", stroke: "#b5d5ff", filter: "url(#shadow)" })}
  <image href="${JOBPOSTED_ICON_URI}" x="884" y="101" width="34" height="34" preserveAspectRatio="xMidYMid meet"/>
  ${t({ x: 924, y: 116, text: "JobPosted", size: 17, weight: 900, fill: "#0b1224" })}
  <circle cx="928" cy="128" r="4" fill="#13b982"/>
  ${t({ x: 939, y: 133, text: "Autofilling...", size: 12.5, weight: 800, fill: "#1354c8" })}
  ${rect({ x: 1195, y: 102, w: 32, h: 32, r: 12, fill: "#f7fbff", stroke: "#d6e6fb" })}
  <path d="M1211 110v4M1211 122v4M1203 118h4M1215 118h4M1205.3 112.3l2.8 2.8M1213.9 120.9l2.8 2.8M1216.7 112.3l-2.8 2.8M1208.1 120.9l-2.8 2.8" stroke="#1354c8" stroke-width="1.6" stroke-linecap="round"/>

  <line x1="862" y1="152" x2="1246" y2="152" stroke="#dbe9fb"/>
  ${rect({ x: 879, y: 169, w: 350, h: 44, r: 13, fill: "#eff6ff" })}
  ${rect({ x: 884, y: 174, w: 110, h: 34, r: 12, fill: "#ffffff" })}
  ${t({ x: 939, y: 197, text: "Autofill", size: 12.5, weight: 900, fill: "#1354c8", anchor: "middle" })}
  ${t({ x: 1050, y: 197, text: "Profile", size: 12.5, weight: 900, fill: "#526178", anchor: "middle" })}
  ${t({ x: 1167, y: 197, text: "Tracker", size: 12.5, weight: 900, fill: "#526178", anchor: "middle" })}

  ${rect({ x: 879, y: 228, w: 350, h: 72, r: 15, fill: "#ffffff", stroke: "#c1dcff" })}
  ${northstarLogo(893, 244, 40)}
  ${t({ x: 946, y: 263, text: "Product Manager, Analytics", size: 15.5, weight: 900, fill: "#0b1224" })}
  ${t({ x: 946, y: 280, text: "Northstar Labs - Los Angeles", size: 11.5, weight: 800, fill: "#526178" })}
  ${rect({ x: 1172, y: 252, w: 43, h: 28, r: 14, fill: "#e4fbef" })}
  ${t({ x: 1193.5, y: 270, text: "82%", size: 12, weight: 900, fill: "#49745f", anchor: "middle" })}

  ${rect({ x: 879, y: 315, w: 350, h: 57, r: 13, fill: "#2768e8" })}
  ${t({ x: 1054, y: 350, text: "Autofilling...", size: 18, weight: 900, fill: "#ffffff", anchor: "middle" })}

  ${t({ x: 879, y: 398, text: "Application fields", size: 13, weight: 900, fill: "#33415b" })}
  ${t({ x: 1227, y: 398, text: "9/11", size: 13, weight: 900, fill: "#33415b", anchor: "end" })}
  <rect x="879" y="409" width="350" height="8" rx="4" fill="#d9e8fd"/>
  <rect x="879" y="409" width="287" height="8" rx="4" fill="#2768e8"/>
  ${checkRow(879, 432, "Name and contact")}
  ${checkRow(879, 474, "Work authorization")}
  ${checkRow(879, 516, "Resume attached")}
  ${rect({ x: 879, y: 564, w: 350, h: 36, r: 13, fill: "#fff8ee", stroke: "#ffd199" })}
  ${t({ x: 891, y: 586, text: "Review final page before Submit", size: 12.4, weight: 900, fill: "#a43d08" })}

  <path d="M1160 519l88 87-44 11-12 29-32-127z" fill="#07142c" stroke="#ffffff" stroke-width="7" stroke-linejoin="round" filter="url(#softShadow)"/>
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
