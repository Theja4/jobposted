export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*:()[\]{}]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function visibleText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function includesAny(haystack: string, needles: RegExp[]): boolean {
  return needles.some((needle) => needle.test(haystack));
}

export function optionScore(option: string, desired: string): number {
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
