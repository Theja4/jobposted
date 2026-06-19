import { describe, expect, it } from "vitest";
import { defaultOnboardingConfig } from "@/lib/onboarding/model";
import { dedupeSelect, scoreJobForConfig, type JobRow } from "./matcher";

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job_1",
    source: "greenhouse",
    source_job_id: "gh_1",
    ats_type: "greenhouse",
    company: "Acme",
    title: "Senior Product Manager",
    location: "Remote",
    remote: "remote",
    description_md:
      "Own product strategy for a B2B SaaS roadmap. Work with engineering, design, analytics, and customers.",
    apply_url: "https://boards.greenhouse.io/acme/jobs/1",
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    posted_at: "2026-06-14T00:00:00.000Z",
    ingested_at: "2026-06-14T00:00:00.000Z",
    ...overrides,
  };
}

function config() {
  const value = defaultOnboardingConfig("person@example.com");
  value.search.titles = ["Product Manager", "Product Owner"];
  value.search.workLocations = ["remote"];
  value.search.jobTypes = ["fulltime"];
  value.filters.match = "high";
  value.profile.skills = ["product strategy", "analytics", "B2B SaaS"];
  return value;
}

/** A technical (software-engineer) profile for stack-gate tests. */
function engConfig(skills: string[], headline: string) {
  const value = defaultOnboardingConfig("eng@example.com");
  value.search.titles = ["Software Engineer"];
  value.search.workLocations = ["remote"];
  value.search.jobTypes = ["fulltime"];
  value.filters.match = "high";
  value.profile.headline = headline;
  value.profile.skills = skills;
  return value;
}

/** A confident product-management profile (product family clears the confidence bar). */
function pmConfig() {
  const value = defaultOnboardingConfig("pm@example.com");
  value.search.titles = ["Product Manager", "Product Owner"];
  value.search.workLocations = ["remote"];
  value.search.jobTypes = ["fulltime"];
  value.filters.match = "high";
  value.profile.headline = "Senior Product Manager";
  value.profile.summary = "Product manager owning roadmap and product strategy.";
  value.profile.skills = ["product strategy", "roadmap", "go to market", "stakeholder"];
  return value;
}

describe("scoreJobForConfig", () => {
  it("marks a strong role match as eligible", () => {
    const decision = scoreJobForConfig(job(), config());
    expect(decision.eligible).toBe(true);
    expect(decision.score).toBeGreaterThanOrEqual(decision.threshold);
    expect(decision.reasons.join(" ")).toContain("Product Manager");
  });

  it("blocks excluded companies and keywords", () => {
    const value = config();
    value.filters.excludeCompanies = ["Acme"];
    value.filters.excludeKeywords = ["clearance"];
    const decision = scoreJobForConfig(
      job({ description_md: "Requires clearance and product analytics experience." }),
      value,
    );
    expect(decision.eligible).toBe(false);
    expect(decision.blockers).toContain("Excluded company: Acme");
    expect(decision.blockers).toContain("Excluded keyword: clearance");
  });

  it("requires include keywords when the user configured them", () => {
    const value = config();
    value.filters.includeKeywords = ["fintech"];

    expect(scoreJobForConfig(job(), value).eligible).toBe(false);
    expect(
      scoreJobForConfig(job({ description_md: "Fintech product analytics platform." }), value)
        .eligible,
    ).toBe(true);
  });

  it("does not allow manual or extension-owned jobs into the server queue", () => {
    const decision = scoreJobForConfig(job({ source: "manual" }), config());
    expect(decision.eligible).toBe(false);
    expect(decision.blockers).toContain("Not an ingest-owned job");
  });

  it("keeps city-level on-site preferences specific", () => {
    const value = config();
    value.search.workLocations = ["onsite_hybrid"];
    value.search.onsiteLocation = "Hyderabad, Telangana, India";

    expect(
      scoreJobForConfig(
        job({ location: "Hyderabad, India", remote: "hybrid" }),
        value,
      ).eligible,
    ).toBe(true);

    const outside = scoreJobForConfig(
      job({ location: "Bengaluru, Karnataka, India", remote: "hybrid" }),
      value,
    );
    expect(outside.eligible).toBe(false);
    expect(outside.blockers).toContain("Outside preferred on-site location");
  });

  it("still allows broad country-level on-site preferences", () => {
    const value = config();
    value.search.workLocations = ["onsite_hybrid"];
    value.search.onsiteLocation = "India";

    expect(
      scoreJobForConfig(
        job({ location: "Bengaluru, Karnataka, India", remote: "hybrid" }),
        value,
      ).eligible,
    ).toBe(true);
  });

  it("matches multi-word city preferences as phrases", () => {
    const value = config();
    value.search.workLocations = ["onsite_hybrid"];
    value.search.onsiteLocation = "San Francisco, California, United States";

    expect(
      scoreJobForConfig(
        job({ location: "San Francisco, CA", remote: "hybrid" }),
        value,
      ).eligible,
    ).toBe(true);

    expect(
      scoreJobForConfig(
        job({ location: "San Jose, California", remote: "hybrid" }),
        value,
      ).eligible,
    ).toBe(false);
  });

  it("keeps 5 day WFO strict to on-site roles in the preferred location", () => {
    const value = config();
    value.search.workLocations = ["onsite_hybrid"];
    value.search.onsiteLocation = "Hyderabad, Telangana, India";
    value.profile.screening.hybridPreference = "5 day WFO";

    expect(
      scoreJobForConfig(job({ location: "Hyderabad, India", remote: "on-site" }), value).eligible,
    ).toBe(true);

    const hybrid = scoreJobForConfig(job({ location: "Hyderabad, India", remote: "hybrid" }), value);
    expect(hybrid.eligible).toBe(false);
    expect(hybrid.blockers).toContain("Outside 5 day WFO preference");

    const remote = scoreJobForConfig(job({ location: "Remote", remote: "remote" }), value);
    expect(remote.eligible).toBe(false);
    expect(remote.blockers).toContain("Outside 5 day WFO preference");
  });

  it("allows remote, hybrid, and WFO when all three work styles are selected", () => {
    const value = config();
    value.search.workLocations = ["remote", "onsite_hybrid"];
    value.search.onsiteLocation = "Hyderabad, Telangana, India";
    value.profile.screening.hybridPreference = "Full remote, Hybrid, 5 day WFO";

    expect(scoreJobForConfig(job({ location: "Remote", remote: "remote" }), value).eligible).toBe(true);
    expect(scoreJobForConfig(job({ location: "Hyderabad, India", remote: "hybrid" }), value).eligible).toBe(true);
    expect(scoreJobForConfig(job({ location: "Hyderabad, India", remote: "on-site" }), value).eligible).toBe(true);
  });

  it("blocks a frontend profile from a gameplay role on every fit setting, even with noise keywords", () => {
    const gameplay = job({
      title: "Software Engineer, Gameplay",
      description_md:
        "Build C++ gameplay systems in Unreal Engine with graphics programming and rendering engine work. " +
        "JavaScript and Python tooling experience is a plus.",
    });

    for (const match of ["high", "higher", "highest"] as const) {
      const value = engConfig(["Angular", "React", "TypeScript", "Frontend"], "Frontend Software Engineer");
      value.filters.match = match;
      const decision = scoreJobForConfig(gameplay, value);
      expect(decision.eligible).toBe(false);
      expect(decision.blockers.join(" ")).toContain("mismatch");
    }
  });

  it("exact fit requires a direct family match; broader fit allows the same-cluster role", () => {
    const backend = job({
      title: "Software Engineer, Backend",
      description_md:
        "Design distributed backend APIs and microservices with Node.js, Postgres, and Kafka.",
    });
    const value = engConfig(["Angular", "React", "TypeScript", "Frontend"], "Frontend Software Engineer");

    value.filters.match = "highest"; // exact → frontend has no direct backend overlap
    expect(scoreJobForConfig(backend, value).eligible).toBe(false);

    value.filters.match = "high"; // broader → same software cluster, allowed
    expect(scoreJobForConfig(backend, value).eligible).toBe(true);
  });

  it("broader fit keeps popular generalist roles flowing", () => {
    const value = pmConfig();
    value.filters.match = "high";
    expect(scoreJobForConfig(job(), value).eligible).toBe(true);
  });

  it("does not treat generic manager or analyst words as product-role matches", () => {
    const value = pmConfig();
    value.search.titles = ["Product Manager", "Product Analyst"];
    value.filters.match = "high";

    for (const title of [
      "Sr. Engineering Manager - Notebook Dataplane",
      "Payments Risk Analyst II",
      "Staff Employee Relations Manager, APAC",
    ]) {
      const decision = scoreJobForConfig(job({ title }), value);
      expect(decision.eligible).toBe(false);
      expect(decision.blockers).toContain("Title does not match selected roles");
    }
  });

  it("blocks jobs whose explicit years requirement is above the profile date span", () => {
    const value = pmConfig();
    value.profile.experience = [
      {
        company: "Ion Group",
        title: "Analyst (Product)",
        location: "",
        startDate: "Oct 2021",
        endDate: "Mar 2026",
        current: false,
        bullets: ["Owned product analytics workflows."],
      },
    ];

    const decision = scoreJobForConfig(
      job({
        title: "Product Manager",
        description_md:
          "Requires 6+ years of product management experience building B2B SaaS products with analytics and roadmap ownership.",
      }),
      value,
    );

    expect(decision.eligible).toBe(false);
    expect(decision.blockers.join(" ")).toContain("Requires 6+ years");
  });

  it("understands plus-word years requirements", () => {
    const value = pmConfig();
    value.profile.experience = [
      {
        company: "Ion Group",
        title: "Analyst (Product)",
        location: "",
        startDate: "Oct 2021",
        endDate: "Mar 2026",
        current: false,
        bullets: ["Owned product analytics workflows."],
      },
    ];

    const decision = scoreJobForConfig(
      job({
        title: "Product Manager",
        description_md:
          "We need eight plus years of experience in product strategy, go to market planning, and roadmap execution.",
      }),
      value,
    );

    expect(decision.eligible).toBe(false);
    expect(decision.blockers.join(" ")).toContain("Requires 8+ years");
  });

  it("does not double-count overlapping experience ranges", () => {
    const value = pmConfig();
    value.profile.experience = [
      {
        company: "Acme",
        title: "Product Analyst",
        location: "",
        startDate: "Jan 2021",
        endDate: "Dec 2024",
        current: false,
        bullets: ["Owned analytics roadmaps."],
      },
      {
        company: "Beta",
        title: "Associate Product Manager",
        location: "",
        startDate: "Jan 2023",
        endDate: "Dec 2025",
        current: false,
        bullets: ["Managed product strategy."],
      },
    ];

    const decision = scoreJobForConfig(
      job({
        title: "Product Manager",
        description_md:
          "Requires 6+ years of product management experience across roadmap, stakeholder, and analytics work.",
      }),
      value,
    );

    expect(decision.eligible).toBe(false);
    expect(decision.blockers.join(" ")).toContain("Requires 6+ years");
  });

  it("allows explicit years requirements within the profile's experience span", () => {
    const value = pmConfig();
    value.profile.experience = [
      {
        company: "Ion Group",
        title: "Analyst (Product)",
        location: "",
        startDate: "Oct 2021",
        endDate: "Mar 2026",
        current: false,
        bullets: ["Owned product analytics workflows."],
      },
    ];

    const decision = scoreJobForConfig(
      job({
        title: "Product Manager",
        description_md:
          "Requires 3+ years of product management experience building B2B SaaS products with analytics and roadmap ownership.",
      }),
      value,
    );

    expect(decision.eligible).toBe(true);
    expect(decision.reasons.join(" ")).toContain("Experience level fits");
  });

  it("does not years-gate when the profile has no dated experience", () => {
    const value = pmConfig();
    const decision = scoreJobForConfig(
      job({
        title: "Product Manager",
        description_md:
          "Requires 8+ years of product management experience building B2B SaaS products with analytics and roadmap ownership.",
      }),
      value,
    );

    expect(decision.blockers.join(" ")).not.toContain("Requires 8+ years");
  });

  it("blocks cross-discipline noise even on broader fit (PM vs backend SWE)", () => {
    const value = pmConfig();
    value.filters.match = "high";
    const swe = job({
      title: "Product Manager",
      description_md:
        "Hands-on backend software engineer building distributed microservices and APIs in Java, Spring, and Postgres.",
    });
    const decision = scoreJobForConfig(swe, value);
    expect(decision.eligible).toBe(false);
    expect(decision.blockers.join(" ")).toContain("Discipline mismatch");
  });

  it("blocks a design profile from an engineering role even on broader fit", () => {
    const designer = defaultOnboardingConfig("designer@example.com");
    designer.search.titles = ["Product Designer", "Software Engineer"];
    designer.search.workLocations = ["remote"];
    designer.search.jobTypes = ["fulltime"];
    designer.filters.match = "high";
    designer.profile.headline = "Product Designer";
    designer.profile.skills = ["Figma", "UI design", "design system", "prototype"];

    const backend = job({
      title: "Software Engineer",
      description_md:
        "Build distributed backend microservices and APIs with Node.js, Postgres, and Kafka.",
    });
    expect(scoreJobForConfig(backend, designer).eligible).toBe(false);
  });

  it("does not block when the job's discipline signal is thin (protects queue volume)", () => {
    const value = engConfig(["Angular", "React", "TypeScript", "Frontend"], "Frontend Software Engineer");
    value.filters.match = "high";
    // A generic JD with no strong discipline signal should still be eligible on title/location.
    const generic = job({
      title: "Software Engineer",
      description_md:
        "Join a fast-growing team building delightful products for customers across the globe.",
    });
    expect(scoreJobForConfig(generic, value).eligible).toBe(true);
  });

  it("falls back to the embedding when the lexical signal is thin (semantic + lexical agree)", () => {
    // One stray backend alias → a primary family exists but lexical confidence is low,
    // and there is no direct overlap with the frontend profile.
    const thin = job({
      title: "Software Engineer",
      description_md: "Experience with Kafka is helpful.",
      similarity: 0.1,
    });

    const onDefault = engConfig(["Angular", "React", "TypeScript", "Frontend"], "Frontend Software Engineer");
    onDefault.filters.match = "higher";
    const blocked = scoreJobForConfig(thin, onDefault);
    expect(blocked.eligible).toBe(false);
    expect(blocked.blockers.join(" ")).toContain("Low semantic fit");

    const onBroad = engConfig(["Angular", "React", "TypeScript", "Frontend"], "Frontend Software Engineer");
    onBroad.filters.match = "high";
    expect(scoreJobForConfig(thin, onBroad).eligible).toBe(true);
  });

  it("does not semantic-gate when no embedding is available", () => {
    const thin = job({
      title: "Software Engineer",
      description_md: "Experience with Kafka is helpful.",
    });
    const value = engConfig(["Angular", "React", "TypeScript", "Frontend"], "Frontend Software Engineer");
    value.filters.match = "high";
    const decision = scoreJobForConfig(thin, value);
    expect(decision.eligible).toBe(true);
    expect(decision.blockers.join(" ")).not.toContain("Low semantic fit");
  });
});

describe("dedupeSelect (cross-board de-dupe)", () => {
  const item = (id: string, key: string | null) => ({ id, job: { dedupe_key: key } });

  it("keeps only one of several rows that share a dedupe_key", () => {
    const out = dedupeSelect([item("a", "acme|swe|remote"), item("b", "acme|swe|remote")], new Set(), 10);
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });

  it("excludes a posting the user already applied to on another board", () => {
    const out = dedupeSelect([item("a", "acme|swe|remote"), item("b", "other|pm|nyc")], new Set(["acme|swe|remote"]), 10);
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });

  it("never de-dupes items without a key, and respects the limit", () => {
    const out = dedupeSelect([item("a", null), item("b", null), item("c", null)], new Set(), 2);
    expect(out.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
