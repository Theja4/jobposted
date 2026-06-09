import type { AtsType, RemoteType } from "@jobposted/shared";

/** A scored job as rendered in the feed (plain types — safe to import from client). */
export interface FeedJob {
  id: string;
  company: string;
  title: string;
  location: string | null;
  remote: RemoteType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  atsType: AtsType;
  applyUrl: string;
  score: number;
  reasons: string[];
  /** True if the user has already queued this job. */
  queued: boolean;
}

/** Open ATS → server apply; logged-in platforms → extension (design doc §2, §11.7). */
export function applyMethodLabel(ats: AtsType): { label: string; via: "server" | "extension" } {
  if (ats === "linkedin" || ats === "workday") return { label: "Via extension", via: "extension" };
  return { label: "Auto-apply", via: "server" };
}
