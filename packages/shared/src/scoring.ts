/**
 * Deterministic job match scoring (design doc §10.3). No LLM — hard filters as eligibility
 * gates plus a keyword/title/skill relevance score, so it runs instantly over the seeded jobs.
 *
 * Designed so a semantic term can be added later without reshaping callers: when job + profile
 * embeddings exist, fold a `vectorSimilarity` contribution into `score` (see the marked spot).
 */

import type { Job, JobPreferences, Profile } from "./types";

export interface MatchResult {
  /** False when a hard filter rules the job out (don't show it). */
  eligible: boolean;
  /** 0–100 relevance for eligible jobs. */
  score: number;
  /** Short human-readable explanations of the match (design doc §10.3 transparency). */
  reasons: string[];
}

function tokens(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function tokenSet(text: string | null | undefined): Set<string> {
  return new Set(tokens(text));
}

/** Best overlap of any target title against the job title (0..1). Substring → 1. */
function titleMatch(jobTitle: string, targetTitles: string[]): number {
  const jt = jobTitle.toLowerCase();
  const jobTokens = tokenSet(jobTitle);
  let best = 0;
  for (const target of targetTitles) {
    const t = target.trim().toLowerCase();
    if (!t) continue;
    if (jt.includes(t)) return 1;
    const tt = tokens(t);
    if (tt.length === 0) continue;
    const matched = tt.filter((tok) => jobTokens.has(tok)).length;
    best = Math.max(best, matched / tt.length);
  }
  return best;
}

function ageDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

/**
 * Score a job for a user. Hard gates set `eligible: false`; the relevance score combines title
 * (≤50), skills (≤25), location/remote (≤12), recency (≤8), and salary (≤5), clamped to 100.
 */
export function scoreJob(job: Job, prefs: JobPreferences, profile?: Profile | null): MatchResult {
  const reasons: string[] = [];

  // ── Hard filters (eligibility) ─────────────────────────────────────────────
  // Sponsorship: drop only when the job explicitly says no sponsorship.
  if (profile?.needsSponsorship && job.visaSponsorship === false) {
    return { eligible: false, score: 0, reasons: ["No visa sponsorship"] };
  }
  // Remote-only: drop confirmed on-site (unknown/ hybrid allowed).
  if (prefs.remoteOnly && job.remote === "on-site") {
    return { eligible: false, score: 0, reasons: ["On-site only"] };
  }
  // Salary floor: drop only when a known max is below the floor.
  if (prefs.minSalary != null && job.salaryMax != null && job.salaryMax < prefs.minSalary) {
    return { eligible: false, score: 0, reasons: ["Below salary floor"] };
  }
  // Company blocklist (design doc §23.5).
  const jobCompany = job.company.trim().toLowerCase();
  if (prefs.excludeCompanies.some((c) => c.trim().toLowerCase() === jobCompany)) {
    return { eligible: false, score: 0, reasons: ["Blocked company"] };
  }

  // ── Relevance score ────────────────────────────────────────────────────────
  let score = 0;

  const tMatch = titleMatch(job.title, prefs.titles);
  if (tMatch > 0) {
    score += tMatch * 50;
    if (tMatch >= 0.99) reasons.push(`Matches your target title`);
    else if (tMatch >= 0.5) reasons.push(`Close to your target titles`);
  }

  if (prefs.skills.length > 0) {
    const haystack = tokenSet(`${job.title} ${job.descriptionMd ?? ""}`);
    const matchedSkills = prefs.skills.filter((s) => {
      const st = tokens(s);
      return st.length > 0 && st.every((tok) => haystack.has(tok));
    });
    if (matchedSkills.length > 0) {
      score += (Math.min(matchedSkills.length, 5) / 5) * 25;
      reasons.push(
        `${matchedSkills.length} of your skill${matchedSkills.length > 1 ? "s" : ""}: ${matchedSkills
          .slice(0, 3)
          .join(", ")}`,
      );
    }
  }

  // Location / remote.
  if (job.remote === "remote") {
    score += prefs.remoteOnly ? 12 : 8;
    reasons.push("Remote");
  } else if (job.remote === "hybrid") {
    score += 5;
  }
  if (prefs.locations.length > 0 && job.location) {
    const loc = job.location.toLowerCase();
    if (prefs.locations.some((l) => l.trim() && loc.includes(l.trim().toLowerCase()))) {
      score += 8;
      reasons.push("In a preferred location");
    }
  }

  // Recency.
  const age = ageDays(job.postedAt) ?? ageDays(job.ingestedAt);
  if (age != null) {
    if (age <= 7) {
      score += 8;
      reasons.push("Posted this week");
    } else if (age <= 30) score += 5;
    else if (age <= 90) score += 2;
  }

  // Salary signal.
  if (prefs.minSalary != null && job.salaryMax != null && job.salaryMax >= prefs.minSalary) {
    score += 5;
    reasons.push("Meets your salary floor");
  }

  // ── (future) semantic term ─────────────────────────────────────────────────
  // if (job.embedding && profileEmbedding) score = 0.6*score + 40*cosine(job.embedding, …);

  return { eligible: true, score: Math.min(100, Math.round(score)), reasons };
}
