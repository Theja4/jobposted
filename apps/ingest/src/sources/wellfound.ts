/**
 * Wellfound (ex-AngelList Talent). It sits behind Cloudflare + DataDome (design doc §9.1), so a
 * plain server-side fetch is blocked (verified: 403). The only viable path is an Apify
 * anti-detect actor, configured via env. Without it, this no-ops with a clear message.
 *
 *   APIFY_TOKEN=...            (account token)
 *   APIFY_WELLFOUND_ACTOR=...  (an actor that scrapes Wellfound, e.g. a marketplace actor id)
 */

import type { RawJob } from "@jobposted/shared";
import { pick, runApifyActor } from "../apify.js";

function mapItem(item: Record<string, unknown>): RawJob | null {
  const title = pick(item, ["title", "jobTitle", "positionName"]);
  const url = pick(item, ["url", "jobUrl", "applyUrl", "link"]);
  if (!title || !url) return null;
  return {
    source: "apify",
    sourceJobId: pick(item, ["id", "jobId"]) ?? url,
    atsType: "other",
    company: pick(item, ["companyName", "company", "organization"]) ?? "",
    title,
    location: pick(item, ["location", "locationName"]),
    remoteRaw: pick(item, ["remote", "workplaceType", "locationType"]),
    descriptionHtml: pick(item, ["descriptionHtml", "description", "descriptionText"]),
    applyUrl: url,
    formQuestions: [],
    salary: null,
    visaSponsorship: null,
    postedAt: pick(item, ["postedAt", "publishedAt", "datePosted"]),
  };
}

/** Fetch Wellfound postings via an Apify actor. Returns [] (with a log) if Apify isn't configured. */
export async function fetchWellfound(queries: string[]): Promise<RawJob[]> {
  const actorId = process.env.APIFY_WELLFOUND_ACTOR;
  if (!process.env.APIFY_TOKEN || !actorId) {
    console.info(
      "[wellfound] skipped — Cloudflare/DataDome-protected. Set APIFY_TOKEN + APIFY_WELLFOUND_ACTOR to enable (design doc §9.1).",
    );
    return [];
  }
  const items = await runApifyActor<Record<string, unknown>>(actorId, { queries });
  return items.map(mapItem).filter((j): j is RawJob => j !== null);
}
