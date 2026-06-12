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
