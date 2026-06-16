import { STATUS_META, type JobApplication, type JobListing } from "./sample-data";
import { TRACKER_COLUMNS, type TrackerItem } from "./tracker-model";

/**
 * Client-side ranked fuzzy search for the job board.
 *
 * Rather than exact substring matching, this mirrors what production search
 * engines (Algolia, Elasticsearch) do at small scale:
 *   • field boosting — a hit in the title outweighs one in the description;
 *   • typo tolerance — bounded Levenshtein distance, with the budget scaled to
 *     term length (Algolia's rule: ≤3 chars exact, 4–7 → 1 typo, 8+ → 2 typos);
 *   • graded match quality — exact > prefix > substring > fuzzy;
 *   • AND semantics — every query term must match *something*, then results are
 *     ranked by summed relevance and tie-broken by fit + recency.
 *
 * O(jobs × terms × tokens) with early-exit Levenshtein — trivial for a board of
 * this size, and the ranking quality is what matters here.
 */

/** Lowercase, strip diacritics, and split into alphanumeric tokens. */
function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Query terms, exposed for match highlighting in the UI. */
export function queryTokens(query: string): string[] {
  return tokenize(query);
}

/** Levenshtein distance with an early exit once `max` is exceeded. */
function boundedLevenshtein(a: string, b: string, max: number): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prev: number[] = Array.from({ length: bl + 1 }, (_, i) => i);
  let curr: number[] = new Array<number>(bl + 1).fill(0);

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      const v = Math.min(del, ins, sub);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1; // whole row already worse than budget
    [prev, curr] = [curr, prev];
  }
  return prev[bl] ?? max + 1;
}

function typoBudget(term: string): number {
  if (term.length <= 3) return 0;
  if (term.length <= 7) return 1;
  return 2;
}

/** Best match quality (0–1) of a query term against the tokens of one field. */
function scoreTermInField(term: string, fieldTokens: string[]): number {
  const budget = typoBudget(term);
  let best = 0;

  for (const token of fieldTokens) {
    if (token === term) return 1; // exact — can't do better
    if (token.startsWith(term)) {
      best = Math.max(best, 0.9);
      continue;
    }
    if (term.length >= 3 && token.includes(term)) {
      best = Math.max(best, 0.74);
      continue;
    }
    if (budget > 0) {
      const d = boundedLevenshtein(term, token, budget);
      if (d <= budget) {
        // Closer edits score higher; a 1-edit fuzzy hit lands around 0.62.
        best = Math.max(best, 0.62 * (1 - (d - 1) / (budget + 1)));
      }
    }
  }
  return best;
}

interface WeightedField {
  weight: number;
  tokens: string[];
  text: string;
}

interface FieldSpec {
  weight: number;
  text: string;
}

function toFields(specs: FieldSpec[]): WeightedField[] {
  return specs.map((s) => ({ weight: s.weight, text: s.text.toLowerCase(), tokens: tokenize(s.text) }));
}

function recencyBoost(iso: string): number {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return Math.max(0, 1 - days / 30) * 0.4; // newer → tiny nudge
}

/**
 * Generic ranked fuzzy search. Field boosting + typo tolerance + AND semantics,
 * shared by every searchable surface (job board, application history, topbar).
 * `secondary` adds a small tie-influencing score (fit, recency); `fallbackSort`
 * orders results on an empty query and breaks score ties.
 */
function rank<T>(
  items: T[],
  query: string,
  fieldsOf: (item: T) => WeightedField[],
  secondary: (item: T) => number,
  fallbackSort: (a: T, b: T) => number,
): T[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [...items].sort(fallbackSort);

  const phrase = terms.join(" ");
  const scored: { item: T; score: number }[] = [];

  for (const item of items) {
    const fields = fieldsOf(item);
    let total = 0;
    let matchedAll = true;

    for (const term of terms) {
      let termBest = 0;
      for (const field of fields) {
        const q = scoreTermInField(term, field.tokens) * field.weight;
        if (q > termBest) termBest = q;
      }
      if (termBest === 0) {
        matchedAll = false;
        break;
      }
      total += termBest;
    }
    if (!matchedAll) continue;

    // Verbatim phrase in the two highest-weight fields gets a boost.
    if ((fields[0]?.text ?? "").includes(phrase)) total += 4;
    else if ((fields[1]?.text ?? "").includes(phrase)) total += 2;

    total += secondary(item);
    scored.push({ item, score: total });
  }

  scored.sort((a, b) => b.score - a.score || fallbackSort(a.item, b.item));
  return scored.map((s) => s.item);
}

/** Rank job listings. Empty query → featured / best-fit / newest. */
export function searchJobs(jobs: JobListing[], query: string): JobListing[] {
  return rank(
    jobs,
    query,
    (j) =>
      toFields([
        { weight: 6, text: j.title },
        { weight: 5, text: j.company },
        { weight: 3.5, text: j.tags.join(" ") },
        { weight: 2.5, text: j.level },
        { weight: 2.5, text: j.location },
        { weight: 2, text: `${j.type} ${j.workplace}` },
        { weight: 1.2, text: j.description },
      ]),
    (j) => j.matchScore / 100 + recencyBoost(j.postedOn),
    (a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return new Date(b.postedOn).getTime() - new Date(a.postedOn).getTime();
    },
  );
}

/** Rank the user's submitted applications. Empty query → newest first. */
export function searchApplications(apps: JobApplication[], query: string): JobApplication[] {
  return rank(
    apps,
    query,
    (a) =>
      toFields([
        { weight: 6, text: a.role },
        { weight: 5, text: a.company },
        { weight: 2.5, text: a.location },
        { weight: 2, text: STATUS_META[a.status].label },
        { weight: 1.5, text: a.resumeName },
      ]),
    (a) => a.matchScore / 100 + recencyBoost(a.appliedOn),
    (a, b) => new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime(),
  );
}

/** Rank tracker cards. Empty query -> newest first inside the current filter set. */
export function searchTrackerItems(items: TrackerItem[], query: string): TrackerItem[] {
  return rank(
    items,
    query,
    (item) =>
      toFields([
        { weight: 6, text: item.role },
        { weight: 5, text: item.company },
        { weight: 2.5, text: item.location },
        { weight: 2.2, text: TRACKER_COLUMNS.find((column) => column.id === item.stage)?.label ?? item.stage },
        { weight: 2, text: item.sourceLabel },
        { weight: 1.5, text: item.platform ?? "" },
        { weight: 1.2, text: item.notes ?? "" },
        { weight: 1, text: item.resumeName },
      ]),
    (item) => item.matchScore / 100 + recencyBoost(item.appliedOn),
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
