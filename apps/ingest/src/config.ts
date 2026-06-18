import { readFile } from "node:fs/promises";

const ATS_TYPES = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "teamtailor",
] as const;

export type IngestAtsType = (typeof ATS_TYPES)[number];

export type CompanyPriority = "high" | "medium" | "low";

export interface CompanyAtsTarget {
  type: IngestAtsType;
  slug: string;
}

export interface CompanyRegistryEntry {
  name: string;
  domain?: string;
  careersUrl?: string;
  countryFocus?: string[];
  priority?: CompanyPriority;
  ats: CompanyAtsTarget[];
}

export interface IngestTarget {
  slug: string;
  companyName?: string;
  companyDomain?: string;
  careersUrl?: string;
  registryPriority?: CompanyPriority;
}

/** A set of public ATS boards to ingest (design doc §9.2/§9.3). */
export interface BoardConfig {
  greenhouse: string[]; // board tokens
  lever: string[]; // company slugs
  ashby: string[]; // organization slugs
  smartrecruiters: string[]; // company identifiers
  workable: string[]; // public account slugs
  teamtailor: string[]; // company subdomains
  companies: CompanyRegistryEntry[]; // curated company metadata + ATS targets
}

const EMPTY: BoardConfig = {
  greenhouse: [],
  lever: [],
  ashby: [],
  smartrecruiters: [],
  workable: [],
  teamtailor: [],
  companies: [],
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean),
        ),
      )
    : [];
}

function isIngestAtsType(value: unknown): value is IngestAtsType {
  return typeof value === "string" && (ATS_TYPES as readonly string[]).includes(value);
}

function normalizeAtsTargets(value: unknown): CompanyAtsTarget[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap(normalizeAtsTargets);
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (isIngestAtsType(record.type)) {
      const slug = typeof record.slug === "string" ? record.slug.trim() : "";
      return slug ? [{ type: record.type, slug }] : [];
    }

    const targets: CompanyAtsTarget[] = [];
    for (const type of ATS_TYPES) {
      const slug = typeof record[type] === "string" ? record[type].trim() : "";
      if (slug) targets.push({ type, slug });
    }
    return targets;
  }

  return [];
}

function normalizeCompanies(value: unknown): CompanyRegistryEntry[] {
  if (!Array.isArray(value)) return [];
  const companies: CompanyRegistryEntry[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) continue;
    const ats = normalizeAtsTargets(record.ats);
    if (ats.length === 0) continue;
    const priority = record.priority;
    companies.push({
      name,
      domain: typeof record.domain === "string" ? record.domain.trim() || undefined : undefined,
      careersUrl:
        typeof record.careersUrl === "string" ? record.careersUrl.trim() || undefined : undefined,
      countryFocus: stringArray(record.countryFocus),
      priority:
        priority === "high" || priority === "medium" || priority === "low" ? priority : undefined,
      ats,
    });
  }

  return companies;
}

/**
 * Load board tokens from a JSON file (INGEST_BOARDS_FILE), shaped like
 * packages/db/seed/board_tokens.example.json. Returns an empty config if unset.
 */
export async function loadBoardConfig(file?: string): Promise<BoardConfig> {
  if (!file && process.env.INGEST_BOARDS_JSON) {
    return normalizeBoardConfig(JSON.parse(process.env.INGEST_BOARDS_JSON));
  }

  const path = file ?? process.env.INGEST_BOARDS_FILE;
  if (!path) return EMPTY;
  return normalizeBoardConfig(JSON.parse(await readFile(path, "utf8")));
}

export function normalizeBoardConfig(parsed: Partial<BoardConfig>): BoardConfig {
  return {
    greenhouse: stringArray(parsed.greenhouse),
    lever: stringArray(parsed.lever),
    ashby: stringArray(parsed.ashby),
    smartrecruiters: stringArray(parsed.smartrecruiters),
    workable: stringArray(parsed.workable),
    teamtailor: stringArray(parsed.teamtailor),
    companies: normalizeCompanies(parsed.companies),
  };
}

export function targetsFor(config: BoardConfig, type: IngestAtsType): IngestTarget[] {
  const targets = new Map<string, IngestTarget>();

  for (const slug of config[type]) {
    targets.set(slug, { slug });
  }

  for (const company of config.companies) {
    for (const target of company.ats) {
      if (target.type !== type) continue;
      targets.set(target.slug, {
        ...targets.get(target.slug),
        slug: target.slug,
        companyName: company.name,
        companyDomain: company.domain,
        careersUrl: company.careersUrl,
        registryPriority: company.priority,
      });
    }
  }

  return [...targets.values()];
}

export function countBoards(config: BoardConfig): number {
  return ATS_TYPES.reduce((sum, type) => sum + targetsFor(config, type).length, 0);
}
