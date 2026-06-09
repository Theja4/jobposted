/**
 * RemoteFront (remotefront.com). Bot-protected — a plain server-side fetch is blocked (verified:
 * 403 on the site and every feed path). Sourced via an Apify actor when configured, else no-op.
 *
 *   APIFY_TOKEN=...
 *   APIFY_REMOTEFRONT_ACTOR=...  (an actor/crawler scoped to remotefront.com)
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
    company: pick(item, ["companyName", "company"]) ?? "",
    title,
    location: pick(item, ["location"]),
    remoteRaw: pick(item, ["remote", "workplaceType"]) ?? "remote", // remote board
    descriptionHtml: pick(item, ["descriptionHtml", "description"]),
    applyUrl: url,
    formQuestions: [],
    salary: null,
    visaSponsorship: null,
    postedAt: pick(item, ["postedAt", "publishedAt", "datePosted"]),
  };
}

/** Fetch RemoteFront postings via an Apify actor. Returns [] (with a log) if Apify isn't configured. */
export async function fetchRemoteFront(queries: string[]): Promise<RawJob[]> {
  const actorId = process.env.APIFY_REMOTEFRONT_ACTOR;
  if (!process.env.APIFY_TOKEN || !actorId) {
    console.info(
      "[remotefront] skipped — bot-protected. Set APIFY_TOKEN + APIFY_REMOTEFRONT_ACTOR to enable (design doc §9.1).",
    );
    return [];
  }
  const items = await runApifyActor<Record<string, unknown>>(actorId, { queries });
  return items.map(mapItem).filter((j): j is RawJob => j !== null);
}
