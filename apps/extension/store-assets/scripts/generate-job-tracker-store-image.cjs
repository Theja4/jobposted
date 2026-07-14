const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const WIDTH = 1280;
const HEIGHT = 800;
const ROOT = path.resolve(__dirname, "../../..");
const generatedPath = path.join(ROOT, "extension/store-assets/generated/jobposted-store-4-job-tracker.png");
const generatedJpgPath = path.join(ROOT, "extension/store-assets/generated/jobposted-store-4-job-tracker.jpg");
const svgPath = path.join(ROOT, "extension/store-assets/generated/jobposted-store-4-job-tracker.svg");
const downloadsPath = "/Users/dr.chandinibuddha/Downloads/JobPosted tracker store image.png";

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

function pill(x, y, label, dot = true, w = null) {
  const width = w ?? Math.max(130, label.length * 7.4 + 36);
  return `
    ${rect({ x, y, w: width, h: 34, r: 17, fill: "#ffffff", stroke: "#b9d8ff" })}
    ${dot ? `<circle cx="${x + 18}" cy="${y + 17}" r="4" fill="#2fd6bd"/>` : ""}
    ${t({ x: x + (dot ? 30 : 18), y: y + 22, text: label, size: 14, weight: 800, fill: "#1354c8" })}
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

function companyLogo(kind, x, y, size = 34) {
  const s = size;
  const cx = x + s / 2;
  const cy = y + s / 2;
  if (kind === "northstar") {
    return `
      ${rect({ x, y, w: s, h: s, r: 11, fill: "#e8f2ff" })}
      <path d="M${cx} ${y + 7}l2.7 7.1 7.3 2.3-7.1 2.8-2.9 7.1-2.9-7.1-7.1-2.8 7.3-2.3L${cx} ${y + 7}z" fill="#1f6fff"/>
      ${t({ x: cx, y: y + 25, text: "N", size: 10, weight: 900, fill: "#0f3d91", anchor: "middle" })}
    `;
  }
  if (kind === "mosaic") {
    return `
      ${rect({ x, y, w: s, h: s, r: 11, fill: "#eef7ff" })}
      <rect x="${x + 8}" y="${y + 8}" width="8" height="8" rx="2" fill="#2563eb"/>
      <rect x="${x + 18}" y="${y + 8}" width="8" height="8" rx="2" fill="#14b8a6"/>
      <rect x="${x + 8}" y="${y + 18}" width="8" height="8" rx="2" fill="#f59e0b"/>
      <rect x="${x + 18}" y="${y + 18}" width="8" height="8" rx="2" fill="#ef4444"/>
    `;
  }
  if (kind === "orbit") {
    return `
      ${rect({ x, y, w: s, h: s, r: 11, fill: "#eefdf8" })}
      <ellipse cx="${cx}" cy="${cy}" rx="12" ry="6.5" transform="rotate(-28 ${cx} ${cy})" fill="none" stroke="#0fba98" stroke-width="3"/>
      <circle cx="${cx + 8}" cy="${cy - 7}" r="3.8" fill="#1363ff"/>
    `;
  }
  if (kind === "aster") {
    return `
      ${rect({ x, y, w: s, h: s, r: 11, fill: "#f0f8ff" })}
      <path d="M${cx} ${y + 7}v20M${x + 7} ${cy}h20M${x + 10} ${y + 10}l14 14M${x + 24} ${y + 10}l-14 14" stroke="#30b870" stroke-width="3.1" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="4" fill="#2563eb"/>
    `;
  }
  return `
    ${rect({ x, y, w: s, h: s, r: 11, fill: "#eef4ff" })}
    <path d="M${x + 7} ${y + 25}l9-16 5 8 4-6 6 14H${x + 7}z" fill="#235dce"/>
    ${t({ x: cx, y: y + 30, text: "S", size: 9, weight: 900, fill: "#ffffff", anchor: "middle" })}
  `;
}

function miniTag(x, y, label, color = "#1354c8", fill = "#eaf3ff") {
  const w = Math.max(62, label.length * 6.4 + 18);
  return `
    ${rect({ x, y, w, h: 23, r: 11.5, fill })}
    ${t({ x: x + 9, y: y + 16, text: label, size: 10.2, weight: 800, fill: color })}
  `;
}

function boardCard({ x, y, w, h = 84, logo, title, company, tag, tag2 }) {
  const titleLines = Array.isArray(title) ? title : [title];
  const titleY = titleLines.length > 1 ? y + 25 : y + 31;
  return `
    ${rect({ x, y, w, h, r: 15, fill: "#ffffff", stroke: "#c4dcff" })}
    ${companyLogo(logo, x + 10, y + 14, 30)}
    ${titleLines.map((line, i) => t({ x: x + 47, y: titleY + i * 14, text: line, size: 11.5, weight: 900, fill: "#111827" })).join("")}
    ${t({ x: x + 47, y: titleY + titleLines.length * 14, text: company, size: 9.7, weight: 800, fill: "#56657a" })}
    ${tag ? miniTag(x + 12, y + h - 32, tag) : ""}
    ${tag2 ? miniTag(x + 12, y + h - 57, tag2, "#1354c8", "#eaf3ff") : ""}
  `;
}

function column({ x, y, w, h, title, count, cards }) {
  return `
    ${rect({ x, y, w, h, r: 16, fill: "#f7fbff", stroke: "#c3dcff" })}
    ${t({ x: x + 12, y: y + 22, text: title, size: 12.2, weight: 900, fill: "#101827" })}
    ${t({ x: x + w - 14, y: y + 22, text: count, size: 11.2, weight: 900, fill: "#55657a", anchor: "end" })}
    ${cards.join("")}
  `;
}

function detailRow(x, y, icon, textValue) {
  return `
    ${rect({ x, y, w: 322, h: 39, r: 12, fill: "#f4f8ff" })}
    ${rect({ x: x + 10, y: y + 8, w: 24, h: 24, r: 8, fill: "#e4f0ff" })}
    ${t({ x: x + 22, y: y + 25, text: icon, size: 13, weight: 900, fill: "#1354c8", anchor: "middle" })}
    ${t({ x: x + 44, y: y + 25, text: textValue, size: 12.3, weight: 800, fill: "#2b3a55" })}
  `;
}

function svg() {
  const savedCards = [
    boardCard({ x: 704, y: 252, w: 156, h: 112, logo: "northstar", title: ["Product", "Analyst"], company: "Northstar Labs", tag: "92% match", tag2: "Resume pinned" }),
    boardCard({ x: 704, y: 376, w: 156, h: 84, logo: "mosaic", title: "Growth PM", company: "Kite Works", tag: "Saved today" }),
  ];
  const appliedCards = [
    boardCard({ x: 878, y: 252, w: 156, h: 84, logo: "mosaic", title: "Data Analyst", company: "Mosaic Systems", tag: "Submitted" }),
    boardCard({ x: 878, y: 346, w: 156, h: 84, logo: "aster", title: "Ops Associate", company: "Aster Health", tag: "Follow up" }),
  ];
  const interviewCards = [
    boardCard({ x: 1052, y: 252, w: 156, h: 84, logo: "orbit", title: "Growth Lead", company: "Orbit Finance", tag: "Call booked" }),
  ];

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

  ${rect({ x: 70, y: 165, w: 66, h: 66, r: 18, fill: "#f8fbff", stroke: "#bfd9ff", sw: 2, filter: "url(#softShadow)" })}
  <path d="M89 200h28M107 182h10v10M117 182l-21 21M93 188v26h26" fill="none" stroke="#2768e8" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>

  ${t({ x: 70, y: 322, text: "Your job search,", size: 69, weight: 900, fill: "#0b1224" })}
  <rect x="72" y="383" width="524" height="14" rx="7" fill="#aee7ee"/>
  ${t({ x: 70, y: 392, text: "finally organized.", size: 69, weight: 900, fill: "#0b1224" })}
  ${t({ x: 70, y: 456, text: "Save roles from any application page,", size: 28, weight: 500, fill: "#243249" })}
  ${t({ x: 70, y: 491, text: "pin the right resume, add notes, and", size: 28, weight: 500, fill: "#243249" })}
  ${t({ x: 70, y: 526, text: "move every lead through your pipeline.", size: 28, weight: 500, fill: "#243249" })}

  ${pill(70, 571, "One-click save")}
  ${pill(230, 571, "Resume pins")}
  ${pill(366, 571, "Notes & stages")}
  <circle cx="80" cy="640" r="10" fill="#2768e8"/>
  ${t({ x: 80, y: 645, text: "✓", size: 13, weight: 900, fill: "#ffffff", anchor: "middle" })}
  ${t({ x: 99, y: 646, text: "Every application has a next step", size: 16, weight: 900, fill: "#1354c8" })}

  ${rect({ x: 672, y: 137, w: 584, h: 457, r: 23, fill: "#ffffff", stroke: "#abd0ff", filter: "url(#shadow)" })}
  ${rect({ x: 1052, y: 100, w: 161, h: 45, r: 22.5, fill: "#ffffff", stroke: "#b8d6ff", filter: "url(#softShadow)" })}
  ${jobPostedShield(1068, 111, 22)}
  ${t({ x: 1102, y: 128, text: "Tracker synced", size: 14, weight: 900, fill: "#1354c8" })}
  ${jobPostedShield(695, 162, 32)}
  ${t({ x: 740, y: 175, text: "JobPosted Tracker", size: 20, weight: 900, fill: "#0b1224" })}
  ${t({ x: 740, y: 195, text: "From saved role to final decision", size: 12.5, weight: 800, fill: "#526178" })}
  ${rect({ x: 1116, y: 160, w: 120, h: 36, r: 18, fill: "#f7fbff", stroke: "#d3e4fb" })}
  <path d="M1132 177a5 5 0 1 0 9 3.2l4 4" fill="none" stroke="#526178" stroke-width="1.8" stroke-linecap="round"/>
  ${t({ x: 1150, y: 183, text: "Search roles", size: 11.5, weight: 800, fill: "#526178" })}

  ${column({ x: 692, y: 216, w: 180, h: 357, title: "Saved", count: "8", cards: savedCards })}
  ${column({ x: 866, y: 216, w: 180, h: 357, title: "Applied", count: "12", cards: appliedCards })}
  ${column({ x: 1040, y: 216, w: 180, h: 357, title: "Interview", count: "3", cards: interviewCards })}

  ${rect({ x: 638, y: 468, w: 360, h: 235, r: 22, fill: "#ffffff", stroke: "#b9d8ff", filter: "url(#shadow)" })}
  ${companyLogo("northstar", 656, 489, 42)}
  ${t({ x: 710, y: 508, text: "Product Analyst", size: 17, weight: 900, fill: "#0b1224" })}
  ${t({ x: 710, y: 524, text: "Northstar Labs - Saved today", size: 11.8, weight: 800, fill: "#56657a" })}
  ${rect({ x: 935, y: 496, w: 42, h: 29, r: 14.5, fill: "#e4fbef" })}
  ${t({ x: 956, y: 515, text: "92%", size: 12, weight: 900, fill: "#49745f", anchor: "middle" })}
  ${detailRow(656, 548, "✓", "Application saved from the page")}
  ${detailRow(656, 597, "R", "Product Analytics Resume.pdf pinned")}
  ${detailRow(656, 646, "N", "Note: follow up after recruiter reply")}

  ${rect({ x: 1006, y: 625, w: 110, h: 76, r: 16, fill: "#ffffff", filter: "url(#softShadow)" })}
  ${t({ x: 1061, y: 657, text: "24", size: 26, weight: 900, fill: "#1354c8", anchor: "middle" })}
  ${t({ x: 1061, y: 689, text: "Active roles", size: 11.3, weight: 800, fill: "#526178", anchor: "middle" })}
  ${rect({ x: 1128, y: 625, w: 110, h: 76, r: 16, fill: "#ffffff", filter: "url(#softShadow)" })}
  ${t({ x: 1183, y: 657, text: "4", size: 26, weight: 900, fill: "#1354c8", anchor: "middle" })}
  ${t({ x: 1183, y: 689, text: "Stages", size: 11.3, weight: 800, fill: "#526178", anchor: "middle" })}
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
  console.log(`Wrote ${downloadsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
