import {
  companyCareerPageUrl,
  resolveCompanyAssetsFromJobUrl,
  type CompanyAssets,
  type RawJob,
} from "@jobposted/shared";
import { mapLimit } from "./util";

function cacheKey(job: RawJob) {
  return `${job.atsType}:${job.company}:${companyCareerPageUrl(job.applyUrl) ?? job.applyUrl}`;
}

function lookupConcurrency() {
  const parsed = Number(process.env.INGEST_LOGO_CONCURRENCY ?? 4);
  if (!Number.isFinite(parsed) || parsed < 1) return 4;
  return Math.min(12, Math.trunc(parsed));
}

export async function enrichRawJobsWithCompanyAssets(jobs: RawJob[]): Promise<RawJob[]> {
  if (process.env.INGEST_COMPANY_LOGOS === "0" || jobs.length === 0) return jobs;

  const timeoutMs = Number(process.env.INGEST_LOGO_TIMEOUT_MS ?? 3500);
  const cache = new Map<string, Promise<CompanyAssets>>();

  return mapLimit(jobs, lookupConcurrency(), async (job) => {
    const key = cacheKey(job);
    let request = cache.get(key);
    if (!request) {
      request = resolveCompanyAssetsFromJobUrl(
        { applyUrl: job.applyUrl },
        { timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 3500 },
      );
      cache.set(key, request);
    }

    const assets = await request;
    return {
      ...job,
      companyDomain: job.companyDomain ?? assets.companyDomain,
      companyLogoUrl: job.companyLogoUrl ?? assets.companyLogoUrl,
      companyLogoResolvedAt: job.companyLogoResolvedAt ?? assets.companyLogoResolvedAt,
    };
  });
}
