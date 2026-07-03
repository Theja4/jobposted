export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*:()[\]{}]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type DegreeLevel = "associate" | "bachelor" | "master" | "doctorate" | "certificate" | "highSchool";

const DEGREE_QUALIFIERS = new Set(["honor", "joint", "major", "minor"]);

function degreeTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => (token === "honour" || token === "honors" || token === "honours" ? "honor" : token));
}

export function degreeLevel(value: string): DegreeLevel | null {
  const text = normalizeText(value);
  const compact = text.replace(/\s+/g, "");
  if (!text) return null;
  if (
    /\bph\s*d\b|\bphd\b|\bdoctorate\b|\bdoctoral\b|\bdoctor of philosophy\b|\bpsy\s*d\b|\bpsyd\b|\bed\s*d\b|\bedd\b|\bjd\b/.test(
      text,
    )
  ) {
    return "doctorate";
  }
  if (
    /\bm\s*tech\b|\bmtech\b|\bmaster(?:s|\s+s)?\b|\bm\s*e\b|\bm\s*s\b|\bms\b|\bm\s*sc\b|\bmsc\b|\bm\s*a\b|\bma\b|\bm\s*com\b|\bmcom\b|\bmca\b|\bmeng\b|\bmba\b/.test(
      text,
    )
  ) {
    return "master";
  }
  if (
    /\bb\s*tech\b|\bbtech\b|\bbachelor(?:s|\s+s)?\b|\bb\s*e\b|\bb\s*s\b|\bbs\b|\bb\s*sc\b|\bbsc\b|\bb\s*a\b|\bba\b|\bb\s*com\b|\bbcom\b|\bbca\b|\bbba\b/.test(
      text,
    ) ||
    /\bbachelor(?:s|\s+s)? (?:of|in) (?:technology|engineering|science|arts?)\b/.test(text) ||
    /\bbachelor(?:s|\s+s)?(?:of|in)(?:technology|engineering|science|arts?)\b/.test(compact)
  ) {
    return "bachelor";
  }
  if (/\bassociate(?:s|\s+s)?\b/.test(text)) return "associate";
  if (/\bdiploma\b|\bcertificate\b|\bcertification\b/.test(text)) return "certificate";
  if (/\bhigh school\b|\bsecondary\b|\bhigher secondary\b|\bhsc\b|\bssc\b|\b12th\b|\b10th\b/.test(text)) return "highSchool";
  return null;
}

export function degreeQualifierMismatch(option: string, desired: string) {
  const optionLevel = degreeLevel(option);
  const desiredLevel = degreeLevel(desired);
  if (!optionLevel || !desiredLevel || optionLevel !== desiredLevel) return false;
  const optionQualifiers = new Set(degreeTokens(option).filter((token) => DEGREE_QUALIFIERS.has(token)));
  const desiredQualifiers = new Set(degreeTokens(desired).filter((token) => DEGREE_QUALIFIERS.has(token)));
  for (const qualifier of optionQualifiers) if (!desiredQualifiers.has(qualifier)) return true;
  for (const qualifier of desiredQualifiers) if (!optionQualifiers.has(qualifier)) return true;
  return false;
}

export function degreeOptionScore(option: string, desired: string) {
  const optionLevel = degreeLevel(option);
  const desiredLevel = degreeLevel(desired);
  if (!optionLevel || !desiredLevel) return null;
  if (optionLevel !== desiredLevel) return 0;
  return degreeQualifierMismatch(option, desired) ? 0.35 : 1;
}

export function visibleText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function includesAny(haystack: string, needles: RegExp[]): boolean {
  return needles.some((needle) => needle.test(haystack));
}

export function optionScore(option: string, desired: string): number {
  const degreeScore = degreeOptionScore(option, desired);
  if (degreeScore !== null) return degreeScore;

  const a = normalizeText(option);
  const b = normalizeText(desired);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.82;
  const aTokens = new Set(a.split(" "));
  const bTokens = b.split(" ");
  const overlap = bTokens.filter((token) => aTokens.has(token)).length;
  return overlap / Math.max(bTokens.length, 1);
}

/**
 * True when a button's text reads like a form action (submit, upload, next, …) rather than a
 * selectable answer option. Used to keep button-based choice groups (e.g. Ashby Yes/No toggles)
 * from ever scooping up — or clicking — the submit/upload/navigation buttons.
 */
export function looksLikeActionControl(text: string | null | undefined): boolean {
  const value = visibleText(text).toLowerCase();
  if (!value) return true;
  return /^(submit|submit application|send|send application|apply|apply now|upload|upload file|upload cv|upload resume|attach|attach file|browse|choose file|choose files|select file|select files|add|add another|add more|remove|delete|clear|reset|edit|cancel|close|dismiss|next|previous|prev|back|continue|save|save and continue|save & continue|review|sign in|signin|log in|login|sign out|sign up|signup|register|search|autofill|autofill from resume|autofill with resume|use my resume|drag and drop|select\.\.\.|select one|choose\.\.\.|choose one)$/.test(
    value,
  );
}
