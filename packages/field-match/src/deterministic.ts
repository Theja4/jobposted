import type { Profile } from "@jobposted/shared";
import type { PageField, StandardFieldKind } from "./types";

/** Patterns that identify standard ATS fields from a control's label/name (design doc §11.2). */
const PATTERNS: { kind: StandardFieldKind; re: RegExp }[] = [
  { kind: "first_name", re: /\b(first.?name|given.?name|forename)\b/i },
  { kind: "last_name", re: /\b(last.?name|surname|family.?name)\b/i },
  { kind: "full_name", re: /\b(full.?name|^name$|your name|legal name)\b/i },
  { kind: "email", re: /\b(e.?mail)\b/i },
  { kind: "phone", re: /\b(phone|mobile|cell|telephone|contact number)\b/i },
  { kind: "location", re: /\b(location|city|address|where.*based|current.*location)\b/i },
  { kind: "linkedin", re: /\b(linkedin)\b/i },
  { kind: "portfolio", re: /\b(portfolio|website|personal site|github|gitlab|url)\b/i },
  { kind: "resume_file", re: /\b(resume|cv|curriculum)\b/i },
  { kind: "cover_letter_file", re: /\b(cover.?letter)\b/i },
];

/** Classify a control, or null if it isn't a recognized standard field. */
export function classifyField(field: PageField): StandardFieldKind | null {
  const haystack = `${field.label} ${field.name ?? ""}`;
  // Files: only resume/cover-letter.
  if (field.type === "file") {
    if (PATTERNS[8]!.re.test(haystack)) return "resume_file";
    if (PATTERNS[9]!.re.test(haystack)) return "cover_letter_file";
    return null;
  }
  for (const { kind, re } of PATTERNS) {
    if (kind === "resume_file" || kind === "cover_letter_file") continue;
    if (re.test(haystack)) return kind;
  }
  return null;
}

/** Produce the value for a standard field from the profile (null → leave blank). */
export function standardValue(kind: StandardFieldKind, profile: Profile): string | null {
  const name = (profile.fullName ?? "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  switch (kind) {
    case "first_name":
      return parts[0] ?? null;
    case "last_name":
      return parts.length > 1 ? parts.slice(1).join(" ") : null;
    case "full_name":
      return name || null;
    case "email":
      return profile.email ?? null;
    case "phone":
      return profile.phone ?? null;
    case "location":
      return profile.location ?? null;
    case "linkedin":
      return profile.linkedinUrl ?? null;
    case "portfolio":
      return profile.portfolioUrl ?? null;
    case "resume_file":
    case "cover_letter_file":
      return null; // handled by the worker's file-upload step, not a text value
  }
}
