import {
  sanitizeOnboardingConfig,
  type JobTypePreference,
  type MatchPreference,
  type OnboardingConfig,
} from "@/lib/onboarding/model";
import { getBundledProEntitlement } from "@/lib/billing/entitlements";
import { computeUsageStatus, type UsageStatus } from "@/lib/billing/usage";
import { CURRENT_BILLING_PLAN_ID, parsePlan, type BillingPlanId, type BillingStatus } from "@/lib/billing/plans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaScopedClient = { from: (table: string) => any; rpc?: (fn: string, args?: Record<string, unknown>) => any };

export type JobRow = {
  id: string;
  source: string | null;
  source_job_id?: string | null;
  ats_type: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  remote: string | null;
  description_md: string | null;
  apply_url: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  posted_at: string | null;
  ingested_at: string | null;
  dedupe_key?: string | null;
  similarity?: number | null;
};

type ProfileRow = {
  email?: string | null;
  application_mode?: string | null;
  active_resume_version_id?: string | null;
};

type OnboardingRow = {
  user_id?: string | null;
  data?: unknown;
  completed_at?: string | null;
};

type ResumeBaseRow = {
  id: string;
  content: unknown;
  embedding?: number[] | string | null;
};

type SubscriptionRow = {
  plan?: string | null;
  status?: string | null;
  daily_limit?: number | null;
  trial_applications_used?: number | null;
};

type UsageSnapshotRow = SubscriptionRow & {
  total_submitted?: number | null;
  today_submitted?: number | null;
};

function activeBundledSubscription() {
  return {
    plan: CURRENT_BILLING_PLAN_ID,
    status: "active" as const,
    dailyLimit: null,
    trialApplicationsUsed: null,
  };
}

type InsertedApplicationRow = {
  id: string;
  job_id: string | null;
  status: string | null;
  field_map: unknown;
};

export type JobMatchDecision = {
  eligible: boolean;
  score: number;
  threshold: number;
  reasons: string[];
  blockers: string[];
  matchedTitle: string | null;
  inferredJobType: JobTypePreference;
};

export type PreparedApplicationSummary = {
  id: string;
  jobId: string;
  company: string;
  title: string;
  status: "queued" | "ready_for_review";
  matchScore: number;
};

export type DailyPrepareResult = {
  ok: true;
  userId: string;
  mode: "auto" | "review";
  scanned: number;
  eligible: number;
  created: number;
  skippedExisting: number;
  limit: number;
  preparedAt: string;
  skippedReason: string | null;
  applications: PreparedApplicationSummary[];
};

export type BulkPrepareResult = {
  ok: true;
  users: number;
  created: number;
  results: DailyPrepareResult[];
  errors: Array<{ userId: string; message: string }>;
};

const SERVER_SOURCES_TO_SKIP = new Set(["manual", "extension", "job_board"]);

const STACK_FAMILIES = {
  frontend: [
    "angular",
    "react",
    "vue",
    "svelte",
    "javascript",
    "typescript",
    "frontend",
    "front end",
    "front-end",
    "web ui",
    "next.js",
    "nextjs",
    "tailwind",
  ],
  backend: [
    "backend",
    "back end",
    "back-end",
    "api",
    "distributed",
    "microservices",
    "node.js",
    "nodejs",
    "django",
    "rails",
    "java",
    "golang",
    "spring",
    "postgres",
    "mysql",
    "database",
    "kafka",
  ],
  game: ["c++", "cpp", "unreal", "unity", "gameplay", "game engine", "rendering engine", "graphics programming", "directx", "opengl"],
  embedded: ["embedded", "firmware", "rtos", "kernel", "driver", "c programming", "c/c++", "microcontroller"],
  data: ["data science", "data engineer", "machine learning", "ml", "analytics", "pytorch", "tensorflow", "spark", "warehouse", "etl", "sql"],
  mobile: ["ios", "android", "swift", "kotlin", "react native", "flutter", "mobile"],
  design: ["product design", "ux", "ui design", "figma", "design system", "prototype", "wireframe", "visual design"],
  product: ["product manager", "product owner", "roadmap", "go to market", "gtm", "product strategy", "backlog", "user stories"],
  business: ["business analyst", "consulting", "consultant", "advisory", "operations", "stakeholder", "process improvement", "requirements gathering", "financial analyst", "engagement manager"],
} as const;

type StackFamily = keyof typeof STACK_FAMILIES;

// Discipline buckets. TECHNICAL families build software/systems; the rest are product/business/design.
const TECHNICAL: ReadonlySet<StackFamily> = new Set<StackFamily>([
  "frontend",
  "backend",
  "mobile",
  "data",
  "game",
  "embedded",
]);

// Systems roles (game/embedded) need a low-level bridge in the profile to be plausible.
const SYSTEMS: ReadonlySet<StackFamily> = new Set<StackFamily>(["game", "embedded"]);

// Coarse clusters: families in the same cluster are one "hop" apart.
const CLUSTER: Record<StackFamily, string> = {
  frontend: "software",
  backend: "software",
  mobile: "software",
  data: "software",
  game: "systems",
  embedded: "systems",
  design: "product",
  product: "product",
  business: "product",
};

// Extra cross-cluster adjacencies that are also one "hop" apart.
const RELATED: Partial<Record<StackFamily, StackFamily[]>> = {
  frontend: ["design"],
  mobile: ["design"],
  design: ["frontend", "mobile"],
  data: ["product"],
  product: ["data"],
  backend: ["embedded"],
  embedded: ["backend"],
};

// How far a job may sit from the profile, per fit-slider setting.
const FIT_MAX_DISTANCE: Record<MatchPreference, 0 | 1 | 2> = {
  highest: 0, // exact: require a direct family match
  higher: 1, // close: same cluster or adjacent
  high: 2, // broader: anything except an egregious discipline/systems clash
};

const FIT_LABEL: Record<MatchPreference, string> = {
  highest: "exact",
  higher: "close",
  high: "broader",
};

// Minimum alias hits before we trust a detected discipline enough to BLOCK on it.
// Thin/ambiguous JDs fall through to the embedding (or pass) so we never starve the queue.
const STACK_CONFIDENCE = 2;

// When the lexical discipline signal is too thin to decide, fall back to the resume↔job cosine
// similarity from vector recall. Scales with the fit slider; only applied when an embedding
// exists (the lexical-only fallback path passes `null` and is unaffected). Conservative so the
// broadest setting barely gates and the daily quota stays fillable.
const SEMANTIC_FLOOR: Record<MatchPreference, number> = {
  highest: 0.22,
  higher: 0.15,
  high: 0.08,
};

/** 0 = same family, 1 = same cluster or adjacent, 2 = unrelated. */
function familyDistance(a: StackFamily, b: StackFamily): 0 | 1 | 2 {
  if (a === b) return 0;
  if (CLUSTER[a] === CLUSTER[b]) return 1;
  if ((RELATED[a] ?? []).includes(b) || (RELATED[b] ?? []).includes(a)) return 1;
  return 2;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function words(text: string) {
  return unique(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1),
  );
}

function includesPhrase(text: string, phrase: string) {
  return text.includes(phrase.trim().toLowerCase());
}

function includesAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => phrase && includesPhrase(text, phrase));
}

function normalizeLocationText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BROAD_LOCATION_COMPONENTS = new Set([
  "africa",
  "asia pacific",
  "australia",
  "brazil",
  "canada",
  "europe",
  "european union",
  "great britain",
  "india",
  "middle east",
  "north america",
  "south america",
  "united arab emirates",
  "united kingdom",
  "united kingdom uk",
  "united states",
  "united states us",
  "uk",
  "us",
]);

const BROAD_LOCATION_WORDS = new Set([
  "africa",
  "america",
  "arab",
  "asia",
  "australia",
  "brazil",
  "britain",
  "canada",
  "east",
  "emirates",
  "europe",
  "european",
  "great",
  "india",
  "kingdom",
  "middle",
  "north",
  "pacific",
  "south",
  "states",
  "uk",
  "union",
  "united",
  "us",
]);

function isBroadLocationComponent(component: string) {
  if (BROAD_LOCATION_COMPONENTS.has(component)) return true;
  const tokens = words(component);
  return tokens.length > 0 && tokens.every((token) => BROAD_LOCATION_WORDS.has(token));
}

function preferredLocationNeedles(preferredLocation: string) {
  if (!preferredLocation || /\banywhere\b/i.test(preferredLocation)) return [];

  const components = unique(
    preferredLocation
      .split(/[,/|·]+/)
      .map(normalizeLocationText)
      .filter(Boolean),
  );
  const firstComponent = components[0];
  if (components.length > 1 && firstComponent && !isBroadLocationComponent(firstComponent)) {
    return [firstComponent];
  }
  const specificComponents = components.filter((component) => !isBroadLocationComponent(component));

  if (specificComponents.length > 0) return specificComponents;

  return unique(
    components.flatMap((component) => [
      component,
      ...words(component).filter((word) => !["in", "anywhere"].includes(word)),
    ]),
  );
}

/** Weighted detection: weight = number of distinct family aliases present in the text. */
function familyWeights(text: string): Map<StackFamily, number> {
  const norm = ` ${text.toLowerCase().replace(/[^a-z0-9+#./-]+/g, " ").replace(/\s+/g, " ")} `;
  const weights = new Map<StackFamily, number>();
  for (const [family, aliases] of Object.entries(STACK_FAMILIES) as Array<[StackFamily, readonly string[]]>) {
    let weight = 0;
    for (const alias of aliases) {
      if (norm.includes(` ${alias.toLowerCase().trim()} `)) weight += 1;
    }
    if (weight > 0) weights.set(family, weight);
  }
  return weights;
}

/** The single most-represented family (immune to "X a plus" one-offs); null if none. */
function primaryFamily(weights: Map<StackFamily, number>): StackFamily | null {
  let best: StackFamily | null = null;
  let bestWeight = 0;
  for (const [family, weight] of weights) {
    if (weight > bestWeight) {
      best = family;
      bestWeight = weight;
    }
  }
  return best;
}

type StackGate = {
  blocked: boolean;
  reason: string | null;
  fitScore: number;
  reasons: string[];
};

/**
 * Positive, slider-aware fit gate. Eligibility flows from the job's *primary* discipline vs
 * the profile's families; strictness is controlled by the fit preference. Egregious
 * discipline / systems clashes are blocked even on the broadest setting, but only when both
 * sides give a confident signal — thin JDs fall through so the daily queue is never starved.
 */
function stackGate(
  profileWeights: Map<StackFamily, number>,
  jobWeights: Map<StackFamily, number>,
  match: MatchPreference,
  similarity: number | null,
): StackGate {
  const profileFamilies = new Set(profileWeights.keys());
  const jobPrimary = primaryFamily(jobWeights);
  const profilePrimary = primaryFamily(profileWeights);
  if (profileFamilies.size === 0 || !jobPrimary || !profilePrimary) {
    return { blocked: false, reason: null, fitScore: 0, reasons: [] };
  }

  // Closest profile family to the job's primary discipline (drives both gating and scoring).
  let best: 0 | 1 | 2 = 2;
  for (const family of profileFamilies) {
    best = Math.min(best, familyDistance(family, jobPrimary)) as 0 | 1 | 2;
  }
  const direct = [...profileFamilies].filter((family) => jobWeights.has(family));

  const confident =
    (jobWeights.get(jobPrimary) ?? 0) >= STACK_CONFIDENCE &&
    (profileWeights.get(profilePrimary) ?? 0) >= STACK_CONFIDENCE;

  // Low lexical confidence: lean on the embedding when we have one.
  if (!confident) {
    if (direct.length > 0) {
      return {
        blocked: false,
        reason: null,
        fitScore: 6,
        reasons: [`Stack/domain fit: ${direct.slice(0, 2).join(", ")}`],
      };
    }
    // No direct overlap and the text can't decide → let the semantic path arbitrate.
    if (typeof similarity === "number" && similarity < SEMANTIC_FLOOR[match]) {
      return {
        blocked: true,
        reason: `Low semantic fit (${Math.round(similarity * 100)}%) for your ${profilePrimary} background`,
        fitScore: 0,
        reasons: [],
      };
    }
    return { blocked: false, reason: null, fitScore: 0, reasons: [] };
  }

  // ── Egregious clashes: blocked at EVERY setting, including "broader". ──
  if (TECHNICAL.has(profilePrimary) !== TECHNICAL.has(jobPrimary)) {
    return {
      blocked: true,
      reason: `Discipline mismatch: ${profilePrimary} profile vs ${jobPrimary} role`,
      fitScore: 0,
      reasons: [],
    };
  }
  const profileHasSystemsBridge = [...profileFamilies].some(
    (family) => SYSTEMS.has(family) || family === "backend",
  );
  if (SYSTEMS.has(jobPrimary) && !profileHasSystemsBridge) {
    return {
      blocked: true,
      reason: `Tech stack mismatch: ${profilePrimary} profile vs ${jobPrimary} role`,
      fitScore: 0,
      reasons: [],
    };
  }

  // ── Slider-controlled distance gate. ──
  if (best > FIT_MAX_DISTANCE[match]) {
    return {
      blocked: true,
      reason: `Outside ${FIT_LABEL[match]} fit: ${jobPrimary} role vs your ${profilePrimary} background`,
      fitScore: 0,
      reasons: [],
    };
  }

  // ── Allowed → reward closeness. ──
  const fitScore = best === 0 ? Math.min(14, 6 + direct.length * 4) : best === 1 ? 8 : 3;
  const label =
    best === 0
      ? `Stack/domain fit: ${(direct.length > 0 ? direct : [jobPrimary]).slice(0, 2).join(", ")}`
      : best === 1
        ? `Adjacent stack fit: ${jobPrimary}`
        : `Broad stack fit: ${jobPrimary}`;
  return { blocked: false, reason: null, fitScore, reasons: [label] };
}

function overlapRatio(needle: string, haystack: string) {
  const needleWords = words(needle);
  if (needleWords.length === 0) return 0;
  const haystackWords = new Set(words(haystack));
  const matched = needleWords.filter((word) => haystackWords.has(word)).length;
  return matched / needleWords.length;
}

const GENERIC_TITLE_WORDS = new Set([
  "associate",
  "analyst",
  "director",
  "executive",
  "head",
  "ii",
  "iii",
  "iv",
  "lead",
  "manager",
  "owner",
  "principal",
  "senior",
  "specialist",
  "sr",
  "staff",
]);

function titleSpecificWords(title: string) {
  return words(title).filter((word) => !GENERIC_TITLE_WORDS.has(word));
}

function titleMatch(selectedTitle: string, jobTitle: string | null | undefined) {
  const title = jobTitle ?? "";
  const ratio = overlapRatio(selectedTitle, title);
  const selectedSpecificWords = titleSpecificWords(selectedTitle);
  const jobWords = new Set(words(title));
  const exactPhrase = includesPhrase(title.toLowerCase(), selectedTitle.toLowerCase());
  const hasSpecificOverlap =
    selectedSpecificWords.length === 0 ||
    selectedSpecificWords.some((word) => jobWords.has(word));
  return {
    title: selectedTitle,
    ratio,
    ok: ratio >= 0.34 && (exactPhrase || hasSpecificOverlap),
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function thresholdForMatch(level: MatchPreference) {
  if (level === "highest") return 80;
  if (level === "higher") return 65;
  return 50;
}

function jobText(job: JobRow) {
  return [
    job.title,
    job.company,
    job.location,
    job.remote,
    job.ats_type,
    job.description_md,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function inferJobType(text: string): JobTypePreference {
  if (/\b(intern|internship|co-op|graduate program)\b/.test(text)) return "internship";
  if (/\b(contract|contractor|freelance|temporary|temp)\b/.test(text)) return "contract";
  if (/\b(part time|part-time)\b/.test(text)) return "part_time";
  return "fulltime";
}

function inferSeniority(text: string) {
  if (/\b(intern|internship|entry|junior|graduate)\b/.test(text)) return "entry";
  if (/\b(associate)\b/.test(text)) return "associate";
  if (/\b(director|head of|vp|vice president|executive)\b/.test(text)) return "director";
  if (/\b(mid|senior|sr\.?|staff|lead|principal|manager)\b/.test(text)) return "mid_senior";
  return "unknown";
}

function seniorityPreferences(values: string[]) {
  return new Set(
    values
      .map((value) => value.toLowerCase())
      .map((value) => {
        if (value.includes("entry")) return "entry";
        if (value.includes("associate")) return "associate";
        if (value.includes("director") || value.includes("above")) return "director";
        if (value.includes("mid") || value.includes("senior")) return "mid_senior";
        return "";
      })
      .filter(Boolean),
  );
}

function workStylePreferences(value: string) {
  const normalized = value.toLowerCase();
  const values = new Set<"remote" | "hybrid" | "wfo">();

  if (
    normalized.includes("full remote") ||
    normalized.includes("remote only") ||
    normalized.includes("i only want full remote") ||
    normalized.includes("open to hybrid")
  ) {
    values.add("remote");
  }
  if (normalized.includes("hybrid") || normalized.includes("open to hybrid")) {
    values.add("hybrid");
  }
  if (
    normalized.includes("5 day wfo") ||
    normalized.includes("five day wfo") ||
    normalized.includes("wfo") ||
    normalized.includes("work from office")
  ) {
    values.add("wfo");
  }

  return values;
}

function workLocationMatches(config: OnboardingConfig, job: JobRow, text: string) {
  const prefs = config.search.workLocations;
  if (prefs.length === 0) return { ok: true, reason: "No work-location restriction" };

  const remote = (job.remote ?? "unknown").toLowerCase();
  const location = (job.location ?? "").toLowerCase();
  const combinedLocationText = `${location} ${text}`;
  const remoteish =
    remote.includes("remote") ||
    /\b(remote|distributed|worldwide|anywhere)\b/.test(combinedLocationText);
  const hybridish = remote.includes("hybrid") || /\bhybrid\b/.test(combinedLocationText);
  const onsiteish =
    hybridish ||
    remote.includes("site") ||
    (!remoteish && remote === "unknown") ||
    /\b(on-site|onsite|office)\b/.test(combinedLocationText);
  const onsiteOnlyish =
    !remoteish &&
    !hybridish &&
    (remote.includes("site") ||
      remote.includes("office") ||
      /\b(on-site|onsite|in[-\s]?office|office[-\s]?based|work\s+from\s+office|wfo)\b/.test(
        combinedLocationText,
      ));
  const locationNeedles = preferredLocationNeedles(config.search.onsiteLocation);
  const normalizedLocation = normalizeLocationText(location);
  const locationMatched =
    locationNeedles.length === 0 || locationNeedles.some((needle) => normalizedLocation.includes(needle));
  const stylePrefs = workStylePreferences(config.profile.screening.hybridPreference);

  if (stylePrefs.size > 0) {
    const styleMatched =
      (stylePrefs.has("remote") && remoteish) ||
      (stylePrefs.has("hybrid") && hybridish) ||
      (stylePrefs.has("wfo") && onsiteOnlyish);
    if (!styleMatched) {
      return {
        ok: false,
        reason:
          stylePrefs.size === 1 && stylePrefs.has("wfo")
            ? "Outside 5 day WFO preference"
            : "Outside selected work-style preferences",
      };
    }
  }

  if (prefs.includes("remote") && remoteish) {
    return { ok: true, reason: "Matches remote preference" };
  }

  if (prefs.includes("onsite_hybrid") && onsiteish) {
    if (locationNeedles.length === 0) {
      return { ok: true, reason: "Matches on-site or hybrid preference" };
    }
    return {
      ok: locationMatched,
      reason: locationMatched
        ? "Matches preferred on-site location"
        : "Outside preferred on-site location",
    };
  }

  return { ok: false, reason: "Does not match work-location preference" };
}

function recursiveText(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => recursiveText(item, depth + 1)).join(" ");
  if (typeof value === "object") {
    return Object.values(value).map((item) => recursiveText(item, depth + 1)).join(" ");
  }
  return "";
}

function profileText(config: OnboardingConfig, resumeContent: unknown) {
  const profile = config.profile;
  return [
    profile.headline,
    profile.summary,
    profile.skills.join(" "),
    profile.experience
      .map((item) => [item.title, item.company, item.bullets.join(" ")].join(" "))
      .join(" "),
    profile.education.map((item) => [item.degree, item.field].join(" ")).join(" "),
    recursiveText(resumeContent),
  ].join(" ");
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const YEAR_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const YEAR_TOKEN = String.raw`(?:\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)`;

function parseYearNumber(value: string) {
  const normalized = value.trim().toLowerCase();
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric;
  return YEAR_WORDS[normalized] ?? null;
}

function dateFromParts(year: number, month: number, boundary: "start" | "end") {
  if (boundary === "start") return new Date(Date.UTC(year, month, 1));
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

function parseExperienceDate(value: unknown, boundary: "start" | "end", now: Date) {
  const text = asString(value).toLowerCase();
  if (!text) return null;
  if (/\b(present|current|now)\b/.test(text)) return now;

  const iso = text.match(/\b(19\d{2}|20\d{2})-(0?[1-9]|1[0-2])(?:-\d{1,2})?\b/);
  if (iso) return dateFromParts(Number(iso[1]), Number(iso[2]) - 1, boundary);

  const yearMonth = text.match(/\b(19\d{2}|20\d{2})[/.](0?[1-9]|1[0-2])\b/);
  if (yearMonth) return dateFromParts(Number(yearMonth[1]), Number(yearMonth[2]) - 1, boundary);

  const numericMonth = text.match(/\b(0?[1-9]|1[0-2])[/.](19\d{2}|20\d{2})\b/);
  if (numericMonth) return dateFromParts(Number(numericMonth[2]), Number(numericMonth[1]) - 1, boundary);

  const monthYear = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(19\d{2}|20\d{2})\b/,
  );
  if (monthYear?.[1] && monthYear[2]) {
    const month = MONTH_INDEX[monthYear[1].replace(".", "")];
    if (month !== undefined) return dateFromParts(Number(monthYear[2]), month, boundary);
  }

  const year = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (year) return boundary === "start"
    ? new Date(Date.UTC(Number(year[1]), 0, 1))
    : new Date(Date.UTC(Number(year[1]), 11, 31, 23, 59, 59, 999));

  return null;
}

function experienceRows(config: OnboardingConfig, resumeContent: unknown) {
  const contentExperience = asRecord(resumeContent).experience;
  const resumeExperience = Array.isArray(contentExperience) ? contentExperience : [];
  return [...config.profile.experience, ...resumeExperience].map(asRecord);
}

function profileExperienceYears(config: OnboardingConfig, resumeContent: unknown, now = new Date()) {
  const nowTime = now.getTime();
  const intervals = experienceRows(config, resumeContent)
    .map((row) => {
      const start = parseExperienceDate(row.startDate, "start", now);
      const explicitEnd = parseExperienceDate(row.endDate, "end", now);
      const end = row.current === true || !asString(row.endDate) ? now : explicitEnd;
      if (!start || !end) return null;
      const startTime = start.getTime();
      const endTime = Math.min(end.getTime(), nowTime);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return null;
      return { start: startTime, end: endTime };
    })
    .filter((interval): interval is { start: number; end: number } => Boolean(interval))
    .sort((a, b) => a.start - b.start);

  if (intervals.length === 0) return null;

  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }

  const days = merged.reduce((sum, interval) => sum + (interval.end - interval.start) / 86_400_000, 0);
  const years = days / 365.25;
  return years > 0 ? years : null;
}

function explicitRequiredExperienceYears(text: string) {
  const normalized = text.toLowerCase().replace(/[–—]/g, "-");
  const candidates: number[] = [];

  const rangePattern = new RegExp(String.raw`\b(${YEAR_TOKEN})\s*(?:-|to)\s*(${YEAR_TOKEN})\s*(?:years?|yrs?)\b.{0,80}\bexperience\b`, "gi");
  for (const match of normalized.matchAll(rangePattern)) {
    const value = parseYearNumber(match[1] ?? "");
    if (value !== null) candidates.push(value);
  }

  const explicitPattern = new RegExp(
    String.raw`\b(?:minimum|min\.?|at\s+least|least|over|more\s+than)\s+(${YEAR_TOKEN})\s*(?:\+|plus)?\s*(?:years?|yrs?)\b.{0,80}\bexperience\b`,
    "gi",
  );
  for (const match of normalized.matchAll(explicitPattern)) {
    const value = parseYearNumber(match[1] ?? "");
    if (value !== null) candidates.push(value);
  }

  const genericPattern = new RegExp(String.raw`\b(${YEAR_TOKEN})\s*(?:\+|plus)?\s*(?:years?|yrs?)\b`, "gi");
  for (const match of normalized.matchAll(genericPattern)) {
    const raw = match[1] ?? "";
    const value = parseYearNumber(raw);
    if (value === null) continue;
    const index = match.index ?? 0;
    const before = normalized.slice(Math.max(0, index - 80), index);
    const after = normalized.slice(index + match[0].length, index + match[0].length + 80);
    if (new RegExp(String.raw`(?:-|to)\s*$`, "i").test(before)) continue;
    if (new RegExp(String.raw`^\s*(?:-|to)\s*${YEAR_TOKEN}\b`, "i").test(after)) continue;
    if (!/\bexperience(?:d)?\b/.test(`${before} ${after}`)) continue;
    candidates.push(value);
  }

  const plausible = candidates.filter((value) => value >= 0 && value <= 30);
  return plausible.length > 0 ? Math.max(...plausible) : null;
}

function formatYears(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, "");
}

function matchedSkillScore(config: OnboardingConfig, resumeContent: unknown, text: string) {
  const skills = unique([
    ...config.profile.skills,
    ...words(profileText(config, resumeContent)).filter((word) => word.length > 3),
  ]).slice(0, 80);
  if (skills.length === 0) return { score: 0, matched: [] as string[] };
  const matched = skills.filter((skill) => includesPhrase(text, skill.toLowerCase())).slice(0, 12);
  const score = Math.min(20, Math.round((matched.length / Math.min(skills.length, 12)) * 20));
  return { score, matched };
}

export function scoreJobForConfig(
  job: JobRow,
  config: OnboardingConfig,
  resumeContent: unknown = null,
): JobMatchDecision {
  const text = jobText(job);
  const resumeText = profileText(config, resumeContent);
  const blockers: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  if (!job.apply_url) blockers.push("No apply URL");
  const source = (job.source ?? "").toLowerCase();
  if (SERVER_SOURCES_TO_SKIP.has(source)) blockers.push("Not an ingest-owned job");

  const excludedCompany = config.filters.excludeCompanies.find((company) => {
    const normalized = company.toLowerCase();
    return normalized && (job.company ?? "").toLowerCase().includes(normalized);
  });
  if (excludedCompany) blockers.push(`Excluded company: ${excludedCompany}`);

  const excludedKeyword = config.filters.excludeKeywords.find((keyword) =>
    includesPhrase(text, keyword.toLowerCase()),
  );
  if (excludedKeyword) blockers.push(`Excluded keyword: ${excludedKeyword}`);

  if (config.filters.includeKeywords.length > 0) {
    const included = config.filters.includeKeywords.filter((keyword) =>
      includesPhrase(text, keyword.toLowerCase()),
    );
    if (included.length === 0) {
      blockers.push("Missing required include keywords");
    } else {
      score += Math.min(12, 4 + included.length * 3);
      reasons.push(`Includes ${included.slice(0, 3).join(", ")}`);
    }
  }

  const similaritySignal =
    typeof job.similarity === "number" && Number.isFinite(job.similarity) ? job.similarity : null;
  const stack = stackGate(familyWeights(resumeText), familyWeights(text), config.filters.match, similaritySignal);
  if (stack.blocked && stack.reason) {
    blockers.push(stack.reason);
  } else if (stack.fitScore > 0) {
    score += stack.fitScore;
    reasons.push(...stack.reasons);
  }

  if (typeof job.similarity === "number" && Number.isFinite(job.similarity)) {
    const semanticScore = Math.max(0, Math.min(1, job.similarity));
    score += Math.round(semanticScore * 24);
    reasons.push(`Semantic fit: ${Math.round(semanticScore * 100)}%`);
  }

  const titleOptions = config.search.titles;
  if (titleOptions.length > 0) {
    const rankedTitles = titleOptions
      .map((title) => titleMatch(title, job.title))
      .sort((a, b) => b.ratio - a.ratio);
    const best = rankedTitles[0] ?? { title: null, ratio: 0, ok: false };
    if (!best.ok) {
      blockers.push("Title does not match selected roles");
    } else {
      score += 35 * best.ratio;
      reasons.push(`Matches ${best.title}`);
    }
  } else {
    score += 10;
    reasons.push("No title filter set");
  }

  const location = workLocationMatches(config, job, text);
  if (!location.ok) blockers.push(location.reason);
  else {
    score += 15;
    reasons.push(location.reason);
  }

  const inferredJobType = inferJobType(text);
  if (config.search.jobTypes.length > 0 && !config.search.jobTypes.includes(inferredJobType)) {
    blockers.push(`Job type is ${inferredJobType}`);
  } else {
    score += 10;
    reasons.push(`Job type: ${inferredJobType}`);
  }

  const preferredSeniority = seniorityPreferences(config.filters.seniority);
  const inferredSeniority = inferSeniority(text);
  if (preferredSeniority.size > 0 && inferredSeniority !== "unknown") {
    if (preferredSeniority.has(inferredSeniority)) {
      score += 8;
      reasons.push("Seniority matches");
    } else {
      blockers.push("Seniority outside selected filters");
    }
  } else if (preferredSeniority.size === 0) {
    score += 5;
  }

  const requiredYears = explicitRequiredExperienceYears(text);
  const profileYears = profileExperienceYears(config, resumeContent);
  if (requiredYears !== null && profileYears !== null) {
    if (profileYears + 0.5 < requiredYears) {
      blockers.push(
        `Requires ${formatYears(requiredYears)}+ years; profile shows about ${formatYears(profileYears)} years`,
      );
    } else {
      score += 6;
      reasons.push(`Experience level fits: ${formatYears(profileYears)} years`);
    }
  }

  const industryMatches = config.filters.industries.filter((industry) =>
    includesPhrase(text, industry.toLowerCase()),
  );
  if (industryMatches.length > 0) {
    score += Math.min(6, industryMatches.length * 2);
    reasons.push(`Industry match: ${industryMatches[0]}`);
  }

  const languageMatches = config.filters.languages.filter((language) =>
    includesPhrase(text, language.toLowerCase()),
  );
  if (languageMatches.length > 0) {
    score += Math.min(4, languageMatches.length * 2);
    reasons.push(`Language match: ${languageMatches[0]}`);
  }

  const skillSignal = matchedSkillScore(config, resumeContent, text);
  if (skillSignal.score > 0) {
    score += skillSignal.score;
    reasons.push(`Skills match: ${skillSignal.matched.slice(0, 3).join(", ")}`);
  }

  if (job.posted_at || job.ingested_at) score += 5;
  const finalScore = clampScore(score);
  const threshold = thresholdForMatch(config.filters.match);

  return {
    eligible: blockers.length === 0 && finalScore >= threshold,
    score: finalScore,
    threshold,
    reasons,
    blockers,
    matchedTitle: reasons.find((reason) => reason.startsWith("Matches "))?.replace("Matches ", "") ?? null,
    inferredJobType,
  };
}

function dbErrorMessage(error: unknown) {
  const record = asRecord(error);
  return (
    asString(record.message) ||
    asString(record.details) ||
    asString(record.hint) ||
    "database_error"
  );
}

function isMissingColumnError(error: unknown, column: string) {
  const record = asRecord(error);
  return (
    asString(record.code) === "42703" ||
    dbErrorMessage(error).toLowerCase().includes(column.toLowerCase())
  );
}

function modeFrom(value: unknown): "auto" | "review" | null {
  return value === "auto" || value === "review" ? value : null;
}

function dailyLimitFromEnv() {
  const value = Number(process.env.JOBPOSTED_DAILY_PREP_LIMIT ?? 20);
  if (!Number.isFinite(value) || value < 1) return 16;
  return Math.min(50, Math.floor(value));
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function prepareLimit(options?: { dailyLimit?: number | null }) {
  const optionLimit = asNumber(options?.dailyLimit);
  if (optionLimit !== null && optionLimit > 0) return Math.min(50, Math.floor(optionLimit));
  return dailyLimitFromEnv();
}

function candidateLimit(options?: { candidateLimit?: number | null }) {
  const optionLimit = asNumber(options?.candidateLimit);
  if (optionLimit !== null && optionLimit > 0) return Math.min(1000, Math.floor(optionLimit));
  const value = Number(process.env.JOBPOSTED_DAILY_CANDIDATE_LIMIT ?? 500);
  if (!Number.isFinite(value) || value < 25) return 500;
  return Math.min(1000, Math.floor(value));
}

function bulkUserLimit(options?: { userLimit?: number | null }) {
  const maxConfigured = Number(process.env.JOBPOSTED_BULK_USER_LIMIT_MAX ?? 5000);
  const max = Number.isFinite(maxConfigured) && maxConfigured > 0 ? Math.floor(maxConfigured) : 5000;
  const explicitLimit = asNumber(options?.userLimit);
  if (explicitLimit !== null && explicitLimit > 0) return Math.min(max, Math.floor(explicitLimit));
  return Number.POSITIVE_INFINITY;
}

function embeddingSql(value: ResumeBaseRow["embedding"] | undefined) {
  if (!value) return null;
  if (typeof value === "string" && value.length > 2) return value;
  if (Array.isArray(value) && value.length === 1536) return JSON.stringify(value);
  return null;
}

async function readProfile(client: SchemaScopedClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("email,application_mode,active_resume_version_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (!isMissingColumnError(error, "application_mode")) return null;
    const fallback = await client
      .from("profiles")
      .select("email,active_resume_version_id")
      .eq("id", userId)
      .maybeSingle();
    if (fallback.error) return null;
    return (fallback.data ?? null) as ProfileRow | null;
  }
  return (data ?? null) as ProfileRow | null;
}

async function readOnboarding(client: SchemaScopedClient, userId: string) {
  const { data, error } = await client
    .from("onboarding_configurations")
    .select("data,completed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`onboarding_read_failed: ${dbErrorMessage(error)}`);
  }
  return (data ?? null) as OnboardingRow | null;
}

async function readResumeBase(client: SchemaScopedClient, userId: string, activeResumeVersionId?: string | null) {
  if (activeResumeVersionId) {
    const { data, error } = await client
      .from("resume_base_versions")
      .select("id,content,embedding")
      .eq("user_id", userId)
      .eq("id", activeResumeVersionId)
      .maybeSingle();
    if (!error && data) return data as ResumeBaseRow;
  }

  const { data, error } = await client
    .from("resume_base_versions")
    .select("id,content,embedding")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as ResumeBaseRow | null;
}

async function countSubmitted(
  client: SchemaScopedClient,
  userId: string,
  range?: { gte: string; lt: string },
) {
  let query = client
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("apply_path", "server")
    .not("submitted_at", "is", null);
  if (range) query = query.gte("submitted_at", range.gte).lt("submitted_at", range.lt);
  const { count, error } = await query;
  if (error) throw new Error(`usage_count_failed: ${dbErrorMessage(error)}`);
  return count ?? 0;
}

async function applyBundledEntitlement(
  client: SchemaScopedClient,
  userId: string,
  status: UsageStatus,
  counts: { totalSubmitted: number; todaySubmitted: number },
) {
  if (status.reason !== "subscription_inactive") return status;
  const entitlement = await getBundledProEntitlement(client, userId);
  if (!entitlement.active) return status;
  return computeUsageStatus({
    subscription: activeBundledSubscription(),
    totalSubmitted: counts.totalSubmitted,
    todaySubmitted: counts.todaySubmitted,
  });
}

async function readUsageStatus(client: SchemaScopedClient, userId: string, now: Date) {
  const dayStart = startOfUtcDay(now);
  const nextDay = new Date(dayStart);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  if (typeof client.rpc === "function") {
    const { data, error } = await client
      .rpc("application_usage_snapshot", {
        p_user_id: userId,
        p_usage_date: dayStart.toISOString().slice(0, 10),
      })
      .maybeSingle();

    if (!error && data) {
      const row = data as UsageSnapshotRow;
      const hasSubscription = Boolean(row.plan || row.status || row.daily_limit || row.trial_applications_used);
      const totalSubmitted = row.total_submitted ?? 0;
      const todaySubmitted = row.today_submitted ?? 0;
      const status = computeUsageStatus({
        subscription: hasSubscription
          ? {
              plan: parsePlan(row.plan) as BillingPlanId | null,
              status: row.status as BillingStatus | null,
              dailyLimit: row.daily_limit ?? null,
              trialApplicationsUsed: row.trial_applications_used ?? null,
            }
          : null,
        totalSubmitted,
        todaySubmitted,
      });
      return applyBundledEntitlement(client, userId, status, { totalSubmitted, todaySubmitted });
    }
  }

  const [{ data: subscription }, totalSubmitted, todaySubmitted] = await Promise.all([
    client.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    countSubmitted(client, userId),
    countSubmitted(client, userId, {
      gte: dayStart.toISOString(),
      lt: nextDay.toISOString(),
    }),
  ]);
  const row = (subscription ?? null) as SubscriptionRow | null;
  const status = computeUsageStatus({
    subscription: row
      ? {
          plan: parsePlan(row.plan) as BillingPlanId | null,
          status: row.status as BillingStatus | null,
          dailyLimit: row.daily_limit ?? null,
          trialApplicationsUsed: row.trial_applications_used ?? null,
        }
      : null,
    totalSubmitted,
    todaySubmitted,
  });
  return applyBundledEntitlement(client, userId, status, { totalSubmitted, todaySubmitted });
}

async function readCandidateJobs(client: SchemaScopedClient, limit: number, resume?: ResumeBaseRow | null) {
  const profileEmbedding = embeddingSql(resume?.embedding);
  if (profileEmbedding && typeof client.rpc === "function") {
    const { data, error } = await client.rpc("match_jobs_for_resume", {
      profile_embedding: profileEmbedding,
      match_limit: limit,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as JobRow[];
    }
  }

  const baseColumns = [
    "id",
    "source",
    "source_job_id",
    "ats_type",
    "company",
    "title",
    "location",
    "remote",
    "description_md",
    "apply_url",
    "salary_min",
    "salary_max",
    "salary_currency",
    "posted_at",
    "ingested_at",
  ];
  const runQuery = (columns: string[], filterClosed = true) => {
    let query = client
      .from("jobs")
      .select(columns.join(","))
      .not("apply_url", "is", null);
    if (filterClosed) query = query.is("closed_at", null);
    return query
      .order("posted_at", { ascending: false, nullsFirst: false })
      .order("ingested_at", { ascending: false, nullsFirst: false })
      .limit(limit);
  };

  let { data, error } = await runQuery([...baseColumns, "dedupe_key"]);
  if (error && isMissingColumnError(error, "dedupe_key")) {
    const fallback = await runQuery(baseColumns);
    data = fallback.data;
    error = fallback.error;
  }
  if (error && isMissingColumnError(error, "closed_at")) {
    const fallback = await runQuery(baseColumns, false);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(`jobs_read_failed: ${dbErrorMessage(error)}`);
  return Array.isArray(data) ? (data as JobRow[]) : [];
}

type ExistingAppliedRow = {
  job_id: string | null;
  jobs?: { dedupe_key: string | null } | { dedupe_key: string | null }[] | null;
};

/**
 * The postings a user has already applied to — both exact `job_id`s and the cross-board
 * `dedupe_key`s of those jobs, so a duplicate of the same role posted on another board (different
 * job_id, different apply_url) is excluded too.
 */
async function readExistingApplied(client: SchemaScopedClient, userId: string) {
  const { data, error } = await client
    .from("applications")
    .select("job_id, jobs(dedupe_key)")
    .eq("user_id", userId);
  if (error) {
    if (!isMissingColumnError(error, "dedupe_key")) {
      throw new Error(`existing_applications_read_failed: ${dbErrorMessage(error)}`);
    }
    const fallback = await client
      .from("applications")
      .select("job_id")
      .eq("user_id", userId);
    if (fallback.error) {
      throw new Error(`existing_applications_read_failed: ${dbErrorMessage(fallback.error)}`);
    }
    return {
      ids: new Set(
        (Array.isArray(fallback.data) ? (fallback.data as Array<{ job_id: string | null }>) : [])
          .map((row) => row.job_id)
          .filter((id): id is string => Boolean(id)),
      ),
      keys: new Set<string>(),
    };
  }
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const row of (Array.isArray(data) ? (data as ExistingAppliedRow[]) : [])) {
    if (row.job_id) ids.add(row.job_id);
    const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
    const key = job?.dedupe_key;
    if (key) keys.add(key);
  }
  return { ids, keys };
}

function setupReady(config: OnboardingConfig, onboarding: OnboardingRow | null) {
  if (!onboarding?.completed_at) return false;
  return config.search.titles.length > 0 && config.search.jobTypes.length > 0;
}

function sortByScoreAndFreshness(
  a: { job: JobRow; decision: JobMatchDecision },
  b: { job: JobRow; decision: JobMatchDecision },
) {
  const scoreDelta = b.decision.score - a.decision.score;
  if (scoreDelta !== 0) return scoreDelta;
  const aTime = Date.parse(a.job.posted_at ?? a.job.ingested_at ?? "") || 0;
  const bTime = Date.parse(b.job.posted_at ?? b.job.ingested_at ?? "") || 0;
  return bTime - aTime;
}

/**
 * Pick up to `limit` scored items, skipping any whose posting `dedupe_key` is already applied to
 * (`appliedKeys`) or already chosen earlier in this list. Items without a key are never deduped.
 * Pure + exported for testing.
 */
export function dedupeSelect<T extends { job: { dedupe_key?: string | null } }>(
  scored: T[],
  appliedKeys: Set<string>,
  limit: number,
): T[] {
  const seen = new Set(appliedKeys);
  const out: T[] = [];
  for (const item of scored) {
    if (out.length >= limit) break;
    const key = item.job.dedupe_key ?? "";
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(item);
  }
  return out;
}

function sourceDocumentDetails(content: unknown) {
  const sourceDocument = asRecord(asRecord(content).sourceDocument);
  return {
    name: asString(sourceDocument.name),
    storagePath: asString(sourceDocument.storagePath),
  };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (!item) break;
      results[index] = await task(item);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function prepareDailyApplicationsForUser(
  client: SchemaScopedClient,
  userId: string,
  options: { dailyLimit?: number | null; candidateLimit?: number | null; now?: Date } = {},
): Promise<DailyPrepareResult> {
  const now = options.now ?? new Date();
  const preparedAt = now.toISOString();
  const configuredLimit = prepareLimit(options);
  const [profile, onboarding] = await Promise.all([
    readProfile(client, userId),
    readOnboarding(client, userId),
  ]);
  const resume = await readResumeBase(client, userId, profile?.active_resume_version_id);
  const config = sanitizeOnboardingConfig(onboarding?.data, profile?.email ?? "");
  const mode = modeFrom(profile?.application_mode) ?? config.final.applicationMode;

  if (!setupReady(config, onboarding)) {
    return {
      ok: true,
      userId,
      mode,
      scanned: 0,
      eligible: 0,
      created: 0,
      skippedExisting: 0,
      limit: configuredLimit,
      preparedAt,
      skippedReason: "setup_incomplete",
      applications: [],
    };
  }

  const usage = await readUsageStatus(client, userId, now);
  const dailyRemaining = Math.max(0, usage.dailyLimit - usage.todaySubmitted);
  const limit = Math.min(configuredLimit, dailyRemaining);
  if (!usage.canSubmit || limit < 1) {
    return {
      ok: true,
      userId,
      mode,
      scanned: 0,
      eligible: 0,
      created: 0,
      skippedExisting: 0,
      limit,
      preparedAt,
      skippedReason: usage.reason,
      applications: [],
    };
  }

  const jobs = await readCandidateJobs(client, candidateLimit(options), resume);
  const ingestJobs = jobs.filter((job) => !SERVER_SOURCES_TO_SKIP.has((job.source ?? "").toLowerCase()));
  const { ids: existingJobIds, keys: existingKeys } = await readExistingApplied(client, userId);

  const scored = ingestJobs
    .filter((job) => !existingJobIds.has(job.id))
    .map((job) => ({ job, decision: scoreJobForConfig(job, config, resume?.content) }))
    .filter((item) => item.decision.eligible)
    .sort(sortByScoreAndFreshness);

  // Cross-board de-dupe: never queue a posting the user already applied to on any board, or the
  // same posting twice in one run, even when it's a different jobs row / apply_url (gaps.md §17).
  const selected = dedupeSelect(scored, existingKeys, limit);
  if (selected.length === 0) {
    return {
      ok: true,
      userId,
      mode,
      scanned: ingestJobs.length,
      eligible: scored.length,
      created: 0,
      skippedExisting: existingJobIds.size,
      limit,
      preparedAt,
      skippedReason: null,
      applications: [],
    };
  }

  const targetStatus = mode === "review" ? "ready_for_review" : "queued";
  const masterResume = sourceDocumentDetails(resume?.content);
  const masterResumePath = masterResume.storagePath;
  const rows = selected.map(({ job, decision }) => ({
    user_id: userId,
    job_id: job.id,
    status: targetStatus,
    apply_path: "server",
    resume_doc_id: null,
    cover_letter_doc_id: null,
    base_version_id: resume?.id ?? null,
    resume_variant_id: null,
    tailoring_delta: null,
    rendered_pdf_path: config.final.tailorResume ? null : masterResumePath || null,
    screenshot_path: null,
    failure_reason: null,
    submitted_at: null,
    field_map: {
      source: "server",
      preparedBy: "daily_matcher",
      mode,
      preparedAt,
      tailoringEnabled: config.final.tailorResume,
      resumeUsed: config.final.tailorResume ? null : masterResumePath || null,
      resumeName: config.final.tailorResume ? null : masterResume.name || null,
      matchScore: decision.score,
      threshold: decision.threshold,
      matchReasons: decision.reasons,
      blockers: decision.blockers,
      matchedTitle: decision.matchedTitle,
      inferredJobType: decision.inferredJobType,
      company: job.company,
      role: job.title,
      location: job.location,
      jobUrl: job.apply_url,
      platform: job.ats_type,
      fieldsFilled: [],
    },
  }));

  const { data, error } = await client
    .from("applications")
    .upsert(rows, { onConflict: "user_id,job_id", ignoreDuplicates: true })
    .select("id,job_id,status,field_map");
  if (error) throw new Error(`applications_prepare_failed: ${dbErrorMessage(error)}`);

  const inserted = Array.isArray(data) ? (data as InsertedApplicationRow[]) : [];
  const selectedByJob = new Map(selected.map((item) => [item.job.id, item]));
  const applications = inserted
    .map((row): PreparedApplicationSummary | null => {
      const item = row.job_id ? selectedByJob.get(row.job_id) : null;
      if (!item || !row.job_id) return null;
      return {
        id: row.id,
        jobId: row.job_id,
        company: item.job.company ?? "Unknown company",
        title: item.job.title ?? "Unknown role",
        status: targetStatus,
        matchScore: item.decision.score,
      };
    })
    .filter((item): item is PreparedApplicationSummary => Boolean(item));

  return {
    ok: true,
    userId,
    mode,
    scanned: ingestJobs.length,
    eligible: scored.length,
    created: applications.length,
    skippedExisting: existingJobIds.size,
    limit,
    preparedAt,
    skippedReason: null,
    applications,
  };
}

export async function prepareDailyApplicationsForAllUsers(
  client: SchemaScopedClient,
  options: { dailyLimit?: number | null; candidateLimit?: number | null; userLimit?: number | null } = {},
): Promise<BulkPrepareResult> {
  const results: DailyPrepareResult[] = [];
  const errors: Array<{ userId: string; message: string }> = [];

  const maxUsers = bulkUserLimit(options);
  const pageSize = Math.min(500, Math.max(25, Number(process.env.JOBPOSTED_BULK_USER_PAGE_SIZE ?? 200) || 200));
  const concurrency = Math.min(10, Math.max(1, Number(process.env.JOBPOSTED_BULK_CONCURRENCY ?? 4) || 4));

  // Keyset pagination on the stable, immutable user_id (not offset over a mutable updated_at sort),
  // so concurrent writes during the run can't make pages skip or duplicate users.
  let cursor: string | null = null;

  while (results.length + errors.length < maxUsers) {
    const remaining = Math.min(pageSize, maxUsers - results.length - errors.length);
    let query = client
      .from("onboarding_configurations")
      .select("user_id")
      .not("completed_at", "is", null)
      .order("user_id", { ascending: true })
      .limit(remaining);
    if (cursor) query = query.gt("user_id", cursor);

    const { data, error } = await query;
    if (error) throw new Error(`onboarding_users_read_failed: ${dbErrorMessage(error)}`);

    const rows = Array.isArray(data) ? (data as OnboardingRow[]) : [];
    if (rows.length === 0) break;

    // Advance the cursor to the page's last user_id (rows are ordered ascending) before
    // processing, so it's independent of per-user success/failure.
    const lastUserId = asString(rows[rows.length - 1]?.user_id);
    if (lastUserId) cursor = lastUserId;

    await mapLimit(rows, concurrency, async (row) => {
      const userId = asString(row.user_id);
      if (!userId) return;
      try {
        results.push(await prepareDailyApplicationsForUser(client, userId, options));
      } catch (errorForUser) {
        errors.push({
          userId,
          message: errorForUser instanceof Error ? errorForUser.message : "prepare_failed",
        });
      }
    });

    if (rows.length < remaining || !lastUserId) break;
  }

  return {
    ok: true,
    users: results.length,
    created: results.reduce((sum, result) => sum + result.created, 0),
    results,
    errors,
  };
}
