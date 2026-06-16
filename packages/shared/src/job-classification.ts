export type NormalizedJobType = "full-time" | "part-time" | "contract" | "internship";
export type NormalizedSeniority = "entry" | "mid" | "senior" | "staff" | "leadership";

function jobText(title: string | null | undefined, description: string | null | undefined) {
  return `${title ?? ""} ${description ?? ""}`.toLowerCase();
}

export function inferJobType(
  title: string | null | undefined,
  description: string | null | undefined,
): NormalizedJobType {
  const text = jobText(title, description);
  if (/\b(intern|internship|co-op|campus)\b/.test(text)) return "internship";
  if (/\b(contract|contractor|temporary|temp|freelance|fractional)\b/.test(text)) return "contract";
  if (/\b(part[-\s]?time|parttime)\b/.test(text)) return "part-time";
  return "full-time";
}

export function inferSeniority(
  title: string | null | undefined,
  description: string | null | undefined,
): NormalizedSeniority {
  const text = jobText(title, description);
  if (/\b(vp|vice president|director|head of|manager|management|executive)\b/.test(text)) {
    return "leadership";
  }
  if (/\b(staff|principal|architect|distinguished)\b/.test(text)) return "staff";
  if (/\b(senior|sr\.?|lead)\b/.test(text)) return "senior";
  if (/\b(entry|junior|jr\.?|graduate|new grad|intern)\b/.test(text)) return "entry";
  return "mid";
}
