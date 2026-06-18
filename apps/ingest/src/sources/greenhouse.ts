/**
 * Greenhouse public Job Board API (design doc §9.2). No auth.
 *   List:      GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *   Questions: GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}?questions=true
 */

import {
  decodeEntities,
  type FormQuestion,
  type FormQuestionType,
  type RawJob,
} from "@jobposted/shared";
import {
  companyDomainFromHints,
  companyNameFromSlug,
  fetchJson,
  mapLimit,
  type CompanyHints,
} from "../util";

const BASE = "https://boards-api.greenhouse.io/v1/boards";

interface GhListResponse {
  jobs: GhJob[];
  meta?: { total?: number };
}

interface GhJob {
  id: number;
  title: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string; // HTML-entity-encoded HTML
  absolute_url: string;
}

interface GhQuestionField {
  name: string;
  type: string;
  values?: { label?: string; value?: string | number }[];
}

interface GhQuestion {
  label: string;
  required?: boolean;
  fields?: GhQuestionField[];
}

interface GhJobDetail extends GhJob {
  questions?: GhQuestion[];
}

function mapFieldType(t: string): FormQuestionType {
  switch (t) {
    case "textarea":
      return "textarea";
    case "multi_value_single_select":
      return "select";
    case "multi_value_multi_select":
      return "multiselect";
    case "input_file":
      return "file";
    default:
      return "text";
  }
}

function slugifyLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "question";
}

function mapQuestions(questions: GhQuestion[] | undefined): FormQuestion[] {
  if (!questions) return [];
  return questions.map((q) => {
    const field = q.fields?.[0];
    const options = field?.values
      ?.map((v) => v.label ?? String(v.value ?? ""))
      .filter((s): s is string => Boolean(s));
    return {
      id: field?.name || slugifyLabel(q.label),
      label: q.label,
      type: field ? mapFieldType(field.type) : "text",
      required: Boolean(q.required),
      ...(options && options.length ? { options } : {}),
    };
  });
}

function toRawJob(boardToken: string, job: GhJobDetail, hints: CompanyHints = {}): RawJob {
  return {
    source: "greenhouse",
    sourceJobId: String(job.id),
    atsType: "greenhouse",
    company: companyNameFromSlug(boardToken, hints),
    companyDomain: companyDomainFromHints(hints),
    title: job.title,
    location: job.location?.name ?? null,
    remoteRaw: job.location?.name ?? null,
    // Greenhouse double-encodes content; decode once so real tags reach htmlToMarkdown.
    descriptionHtml: job.content ? decodeEntities(job.content) : null,
    applyUrl: job.absolute_url,
    formQuestions: mapQuestions(job.questions),
    salary: null,
    visaSponsorship: null,
    postedAt: job.updated_at ?? null,
  };
}

/**
 * Fetch all postings for a Greenhouse board. When `withQuestions` is set, also fetches the
 * per-job question set (bounded concurrency; optionally capped to the first N jobs so we don't
 * hammer the source during local runs).
 */
export async function fetchGreenhouseBoard(
  boardToken: string,
  opts: { withQuestions?: boolean; questionsLimit?: number } & CompanyHints = {},
): Promise<RawJob[]> {
  const list = await fetchJson<GhListResponse>(
    `${BASE}/${encodeURIComponent(boardToken)}/jobs?content=true`,
  );
  const jobs = list.jobs ?? [];

  if (!opts.withQuestions) return jobs.map((j) => toRawJob(boardToken, j, opts));

  const targets = opts.questionsLimit ? jobs.slice(0, opts.questionsLimit) : jobs;
  const detailed = await mapLimit(targets, 4, async (job) => {
    try {
      const detail = await fetchJson<GhJobDetail>(
        `${BASE}/${encodeURIComponent(boardToken)}/jobs/${job.id}?questions=true`,
      );
      return toRawJob(boardToken, detail, opts);
    } catch {
      return toRawJob(boardToken, job, opts); // fall back to the list row if questions fail
    }
  });

  // Any jobs beyond the questions cap still get ingested (without questions).
  const rest = jobs.slice(targets.length).map((j) => toRawJob(boardToken, j, opts));
  return [...detailed, ...rest];
}
