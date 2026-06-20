/**
 * End-to-end matching check: drive the REAL scorer (`scoreJobForConfig`) + selection
 * (`dedupeSelect`) with a realistic frontend-engineer profile against a curated board, and assert
 * we shortlist the right roles and block the wrong ones with the right reasons. No mocks — this is
 * the production matching code.
 */
import { describe, expect, it } from "vitest";
import type { ResumeContent } from "@jobposted/shared";
import { defaultOnboardingConfig, type OnboardingConfig } from "@/lib/onboarding/model";
import { dedupeSelect, scoreJobForConfig, type JobRow } from "./matcher";

function frontendCandidate(match: OnboardingConfig["filters"]["match"] = "higher"): OnboardingConfig {
  const config = defaultOnboardingConfig("cand@example.com");
  config.search.titles = ["Frontend Engineer", "Software Engineer"];
  config.search.workLocations = ["remote"];
  config.search.jobTypes = ["fulltime"];
  config.filters.match = match;
  config.filters.seniority = ["Mid-Senior"];
  config.filters.excludeKeywords = ["crypto"];
  config.filters.excludeCompanies = ["Initech"];
  config.profile.headline = "Senior Frontend Engineer";
  config.profile.summary = "Frontend engineer building React and TypeScript web apps.";
  config.profile.skills = ["React", "TypeScript", "Next.js", "JavaScript", "CSS", "Frontend"];
  config.profile.experience = [
    {
      company: "Acme",
      title: "Frontend Engineer",
      location: "Remote",
      startDate: "2022-01",
      endDate: "",
      current: true,
      bullets: ["Built React frontend components in TypeScript and Next.js"],
    },
  ];
  return config;
}

const RESUME: ResumeContent = {
  name: "Casey Dev",
  headline: "Senior Frontend Engineer",
  summary: "Frontend engineer building accessible React + TypeScript apps.",
  email: "cand@example.com",
  phone: "",
  location: "Remote",
  links: [],
  experience: [
    {
      company: "Acme",
      title: "Frontend Engineer",
      startDate: "2022-01",
      current: true,
      bullets: ["Built a React + TypeScript design system and Next.js apps"],
    },
  ],
  education: [],
  skills: ["React", "TypeScript", "Next.js", "JavaScript", "CSS"],
  projects: [],
  certifications: [],
  languages: [],
  awards: [],
  publications: [],
  interests: [],
  references: [],
};

const NOW = "2026-06-19T00:00:00.000Z";

function job(overrides: Partial<JobRow> & Pick<JobRow, "id">): JobRow {
  return {
    source: "greenhouse",
    source_job_id: overrides.id,
    ats_type: "greenhouse",
    company: "Example Co",
    title: "Frontend Engineer",
    location: "Remote",
    remote: "remote",
    description_md: "",
    apply_url: `https://boards.greenhouse.io/example/jobs/${overrides.id}`,
    posted_at: NOW,
    ingested_at: NOW,
    similarity: null,
    dedupe_key: overrides.id,
    ...overrides,
  } as JobRow;
}

const JOBS: JobRow[] = [
  job({
    id: "fe-strong",
    company: "Vercel",
    title: "Senior Frontend Engineer",
    ats_type: "greenhouse",
    description_md:
      "Build our React and TypeScript design system. Own frontend architecture, Next.js apps, and component libraries. 3+ years frontend experience.",
  }),
  job({
    id: "be-adjacent",
    company: "Stripe",
    source: "lever",
    ats_type: "lever",
    title: "Senior Software Engineer, Backend",
    apply_url: "https://jobs.lever.co/stripe/be-adjacent",
    description_md:
      "Backend engineer. Build scalable APIs and microservices with Node.js and Postgres on distributed systems and databases.",
  }),
  job({
    id: "pm-mismatch",
    company: "Notion",
    title: "Product Manager",
    description_md:
      "As a Product Manager you own the product roadmap, write user stories, groom the backlog, and lead go to market with product strategy.",
  }),
  job({
    id: "embedded-mismatch",
    company: "SpaceX",
    title: "Embedded Firmware Engineer",
    description_md:
      "Write embedded firmware in C/C++ for microcontrollers, RTOS, device drivers, and kernel modules.",
  }),
  job({
    id: "too-senior",
    company: "BigCo",
    title: "Senior Frontend Engineer",
    description_md:
      "Senior frontend engineer building React and TypeScript apps. Requires 8+ years of professional frontend experience.",
  }),
  job({
    id: "excluded-keyword",
    company: "CoinThing",
    title: "Frontend Engineer",
    description_md: "Build a crypto exchange frontend in React and TypeScript.",
  }),
  job({ id: "no-apply-url", company: "GhostCo", apply_url: null, description_md: "Frontend Engineer building React apps." }),
  job({
    id: "excluded-company",
    company: "Initech",
    title: "Frontend Engineer",
    description_md: "Frontend Engineer building React and TypeScript apps.",
  }),
  job({
    id: "onsite-only",
    company: "OfficeCorp",
    title: "Frontend Engineer",
    remote: "onsite",
    location: "Austin, TX",
    description_md: "On-site frontend engineer building React apps from our Austin office.",
  }),
  job({
    id: "internship",
    company: "InternHub",
    title: "Frontend Engineering Intern",
    description_md: "Summer internship building React components. This is an internship for students.",
  }),
];

describe("E2E: job matching shortlists the right roles", () => {
  const config = frontendCandidate("higher");
  const decisions = new Map(JOBS.map((j) => [j.id, scoreJobForConfig(j, config, RESUME)]));
  const decisionFor = (id: string) => decisions.get(id)!;

  it("accepts a direct frontend role with a high score", () => {
    const d = decisionFor("fe-strong");
    expect(d.eligible).toBe(true);
    expect(d.score).toBeGreaterThanOrEqual(d.threshold);
    expect(d.matchedTitle).toBeTruthy();
  });

  it("accepts an adjacent backend role on the 'broader/close' setting", () => {
    expect(decisionFor("be-adjacent").eligible).toBe(true);
  });

  it("blocks that same backend role on the strict 'exact' setting", () => {
    const strict = scoreJobForConfig(
      JOBS.find((j) => j.id === "be-adjacent")!,
      frontendCandidate("highest"),
      RESUME,
    );
    expect(strict.eligible).toBe(false);
    expect(strict.blockers.join(" ")).toMatch(/exact fit/i);
  });

  it("blocks a non-technical product role as a discipline mismatch", () => {
    const d = decisionFor("pm-mismatch");
    expect(d.eligible).toBe(false);
    expect(d.blockers.join(" ")).toMatch(/discipline mismatch/i);
  });

  it("blocks a systems/embedded role with no low-level bridge in the profile", () => {
    const d = decisionFor("embedded-mismatch");
    expect(d.eligible).toBe(false);
    expect(d.blockers.join(" ")).toMatch(/stack mismatch/i);
  });

  it("blocks a role demanding more years than the profile evidences", () => {
    const d = decisionFor("too-senior");
    expect(d.eligible).toBe(false);
    expect(d.blockers.join(" ")).toMatch(/8\+? years/i);
  });

  it("blocks an excluded keyword, excluded company, missing apply URL, onsite-only, and internship", () => {
    expect(decisionFor("excluded-keyword").blockers.join(" ")).toMatch(/excluded keyword: crypto/i);
    expect(decisionFor("excluded-company").blockers.join(" ")).toMatch(/excluded company: initech/i);
    expect(decisionFor("no-apply-url").blockers.join(" ")).toMatch(/no apply url/i);
    expect(decisionFor("onsite-only").blockers.join(" ")).toMatch(/work-location/i);
    expect(decisionFor("internship").blockers.join(" ")).toMatch(/job type is internship/i);

    expect(decisionFor("excluded-keyword").eligible).toBe(false);
    expect(decisionFor("excluded-company").eligible).toBe(false);
    expect(decisionFor("no-apply-url").eligible).toBe(false);
    expect(decisionFor("onsite-only").eligible).toBe(false);
    expect(decisionFor("internship").eligible).toBe(false);
  });

  it("selects exactly the two eligible roles, frontend ranked first, deduped", () => {
    const scored = JOBS.map((j) => ({ job: j, decision: decisionFor(j.id) }))
      .filter((item) => item.decision.eligible)
      .sort((a, b) => b.decision.score - a.decision.score);

    const selected = dedupeSelect(scored, new Set<string>(), 20);
    const ids = selected.map((s) => s.job.id);

    expect(ids).toEqual(["fe-strong", "be-adjacent"]);
  });

  it("does not re-select a posting already applied to on another board (cross-board dedupe)", () => {
    const scored = JOBS.map((j) => ({ job: j, decision: decisionFor(j.id) }))
      .filter((item) => item.decision.eligible)
      .sort((a, b) => b.decision.score - a.decision.score);

    const alreadyApplied = new Set<string>(["fe-strong"]); // same dedupe_key seen on another board
    const selected = dedupeSelect(scored, alreadyApplied, 20);
    expect(selected.map((s) => s.job.id)).toEqual(["be-adjacent"]);
  });
});
