import { normalizeText } from "./text";

/**
 * Local, dependency-free fuzzy matcher for Workday's controlled-vocabulary fields
 * (degree, field of study, skills). The profile value rarely matches an option exactly —
 * "Computer Science" appears as "Computer and Information Science", a degree option reads
 * "Three to Four year University Bachelors degree (e.g. BA, BS)" — so we score on a blend of
 * token-set overlap (the dominant signal for these vocabularies) and character similarity
 * (Sørensen–Dice + Jaro–Winkler) to catch spelling/variant drift. No network, no LLM.
 */

// Words that carry no discriminating signal in academic/skill vocabularies.
const NOISE_TOKENS = new Set([
  "and",
  "or",
  "of",
  "the",
  "a",
  "an",
  "in",
  "for",
  "to",
  "with",
  "degree",
  "diploma",
  "certificate",
  "university",
  "college",
  "school",
  "year",
  "years",
  "eg",
  "ie",
  "etc",
]);

function stripParentheticals(value: string): string {
  // "...Bachelors degree (e.g. BA, BS)" -> drop the parenthetical example so it doesn't leak tokens.
  return value.replace(/\([^)]*\)/g, " ");
}

// Conservative stem: collapse a trailing plural "s" so bachelor≈bachelors, skill≈skills.
function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function contentTokens(value: string): string[] {
  return normalizeText(stripParentheticals(value))
    .split(" ")
    .filter((token) => token.length > 1 && !NOISE_TOKENS.has(token))
    .map(stem);
}

function bigrams(value: string): string[] {
  const grams: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) grams.push(value.slice(index, index + 2));
  return grams;
}

/** Sørensen–Dice coefficient over character bigrams (order-tolerant). */
function diceCoefficient(a: string, b: string): number {
  const aFlat = a.replace(/\s+/g, "");
  const bFlat = b.replace(/\s+/g, "");
  if (aFlat === bFlat) return aFlat ? 1 : 0;
  if (aFlat.length < 2 || bFlat.length < 2) return 0;
  const counts = new Map<string, number>();
  const aGrams = bigrams(aFlat);
  const bGrams = bigrams(bFlat);
  for (const gram of aGrams) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  let intersection = 0;
  for (const gram of bGrams) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      counts.set(gram, remaining - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (aGrams.length + bGrams.length);
}

/** Jaro similarity. */
function jaro(a: string, b: string): number {
  if (a === b) return a ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  transpositions /= 2;
  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

/** Jaro–Winkler: boosts shared-prefix matches (helps short academic terms, electronics↔electrical). */
function jaroWinkler(a: string, b: string): number {
  const base = jaro(a, b);
  let prefix = 0;
  const limit = Math.min(4, a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] === b[i]) prefix += 1;
    else break;
  }
  return base + prefix * 0.1 * (1 - base);
}

/**
 * Token-set score with a subset bonus. Rewards "computer science" ⊆ "computer and information
 * science" without over-rewarding a single shared token ("computer engineering"). The subset
 * branch folds in recall so the tightest containing option (plain "Bachelors degree") edges out
 * verbose variants ("Joint:/Major: ... Bachelors degree").
 */
function tokenSetScore(aTokens: string[], bTokens: string[]): number {
  if (!aTokens.length || !bTokens.length) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let shared = 0;
  for (const token of aSet) if (bSet.has(token)) shared += 1;
  if (shared === 0) return 0;
  const precision = shared / aSet.size;
  const recall = shared / bSet.size;
  const f1 = (2 * precision * recall) / (precision + recall);
  const allTargetTokensPresent = [...aSet].every((token) => bSet.has(token));
  return allTargetTokensPresent ? Math.max(f1, 0.82 + 0.16 * recall) : f1;
}

// Two tokens count as "the same word" for alignment only when near-identical.
const NEAR_TOKEN_THRESHOLD = 0.84;

/**
 * Soft token overlap: each target token aligns to its best option token, contributing only when
 * the pair is near-identical (electronic↔electrical), then scored as token F1. Unlike whole-string
 * Jaro–Winkler this does NOT reward incidental shared letters across unrelated multi-word strings.
 */
function softTokenScore(aTokens: string[], bTokens: string[]): number {
  if (!aTokens.length || !bTokens.length) return 0;
  let matched = 0;
  for (const a of aTokens) {
    let best = 0;
    for (const b of bTokens) {
      if (a === b) {
        best = 1;
        break;
      }
      best = Math.max(best, jaroWinkler(a, b));
    }
    if (best >= NEAR_TOKEN_THRESHOLD) matched += best;
  }
  if (matched === 0) return 0;
  const precision = matched / aTokens.length;
  const recall = matched / bTokens.length;
  return (2 * precision * recall) / (precision + recall);
}

/** Similarity of `a` (target) to `b` (candidate option), 0..1. */
export function fuzzyScore(a: string, b: string): number {
  const aTokens = contentTokens(a);
  const bTokens = contentTokens(b);
  const aContent = aTokens.join(" ");
  const bContent = bTokens.join(" ");
  if (!aContent || !bContent) {
    // One side is all noise/punctuation — fall back to raw normalized comparison.
    const rawA = normalizeText(a);
    const rawB = normalizeText(b);
    if (!rawA || !rawB) return 0;
    if (rawA === rawB) return 1;
    return Math.max(diceCoefficient(rawA, rawB), jaroWinkler(rawA, rawB));
  }
  if (aContent === bContent) return 1;
  const token = tokenSetScore(aTokens, bTokens);
  const soft = 0.95 * softTokenScore(aTokens, bTokens);
  const character = diceCoefficient(aContent, bContent);
  return Math.min(1, Math.max(token, soft, character));
}

export interface FuzzyMatch<T> {
  option: T;
  score: number;
}

/** Default acceptance threshold for "confident enough to fill"; below this we leave the field. */
export const DEFAULT_FUZZY_THRESHOLD = 0.6;

/** Best option at or above `threshold`, else null (leave blank rather than guess wrong). */
export function bestMatch<T>(
  target: string,
  options: T[],
  getText: (option: T) => string,
  threshold = DEFAULT_FUZZY_THRESHOLD,
): FuzzyMatch<T> | null {
  let best: FuzzyMatch<T> | null = null;
  for (const option of options) {
    const score = fuzzyScore(target, getText(option));
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score >= threshold ? best : null;
}
