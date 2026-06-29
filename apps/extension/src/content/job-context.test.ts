import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import {
  companyFromUrl,
  JOB_CONTEXT_CONFIDENCE_THRESHOLD,
  parseJobPostingJsonLd,
  resolveJobContext,
  splitRoleAndCompany,
} from "./job-context";

function documentFrom(html: string) {
  return parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`).document;
}

function withJsonLd(json: unknown, body = "") {
  return documentFrom(
    `<script type="application/ld+json">${JSON.stringify(json)}</script>${body}`,
  );
}

describe("job-context resolver", () => {
  it("reads role, company and location from JSON-LD JobPosting", () => {
    const doc = withJsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Staff Software Engineer",
      hiringOrganization: { "@type": "Organization", name: "Databricks" },
      jobLocation: { address: { addressLocality: "San Francisco", addressRegion: "CA" } },
    });
    const parsed = parseJobPostingJsonLd(doc);
    expect(parsed).toMatchObject({
      role: "Staff Software Engineer",
      company: "Databricks",
      location: "San Francisco, CA",
    });
  });

  it("finds JobPosting inside an @graph array", () => {
    const doc = withJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "BreadcrumbList" },
        { "@type": ["JobPosting"], title: "Product Designer", hiringOrganization: "Airbnb" },
      ],
    });
    expect(parseJobPostingJsonLd(doc)).toMatchObject({ role: "Product Designer", company: "Airbnb" });
  });

  it("ignores malformed JSON-LD without throwing", () => {
    const doc = documentFrom('<script type="application/ld+json">{ not valid json }</script>');
    expect(parseJobPostingJsonLd(doc)).toBeNull();
  });

  it("resolves JSON-LD with high confidence over weaker signals", () => {
    const doc = withJsonLd(
      { "@type": "JobPosting", title: "Backend Engineer", hiringOrganization: { name: "Stripe" } },
      "<h1>Some unrelated heading</h1>",
    );
    const resolved = resolveJobContext({ doc, url: "https://stripe.com/jobs/123" });
    expect(resolved.role).toBe("Backend Engineer");
    expect(resolved.company).toBe("Stripe");
    expect(resolved.source).toBe("json-ld");
    expect(resolved.confidence).toBeGreaterThanOrEqual(JOB_CONTEXT_CONFIDENCE_THRESHOLD);
  });

  it("falls back to Open Graph when JSON-LD is absent", () => {
    const doc = documentFrom(
      `<meta property="og:title" content="Senior Data Scientist at Notion" />
       <meta property="og:site_name" content="Notion" />`,
    );
    const resolved = resolveJobContext({ doc, url: "https://notion.so/careers/1" });
    expect(resolved.role).toBe("Senior Data Scientist");
    expect(resolved.company).toBe("Notion");
    expect(resolved.source).toBe("open-graph");
  });

  it("uses platform DOM hints (e.g. Workday) when present", () => {
    const doc = documentFrom("<h1>Apply</h1>");
    const resolved = resolveJobContext({
      doc,
      url: "https://acme.wd5.myworkdayjobs.com/CompanyCareers/job/x/Engineer",
      hints: { role: "Senior Engineer", company: "Acme Corp" },
    });
    expect(resolved.role).toBe("Senior Engineer");
    expect(resolved.company).toBe("Acme Corp");
    expect(resolved.source).toBe("platform-dom");
  });

  it("mixes sources: role from JSON-LD, company from URL slug", () => {
    const doc = withJsonLd({ "@type": "JobPosting", title: "Frontend Engineer" });
    const resolved = resolveJobContext({ doc, url: "https://boards.greenhouse.io/databricks/jobs/55" });
    expect(resolved.role).toBe("Frontend Engineer");
    expect(resolved.company).toBe("Databricks");
    // Company came from a weak URL signal → overall confidence drops below the
    // confirm threshold so the panel asks the user to verify.
    expect(resolved.confidence).toBeLessThan(JOB_CONTEXT_CONFIDENCE_THRESHOLD);
  });

  it("derives company from Workday, Greenhouse, Lever and Ashby URLs", () => {
    expect(companyFromUrl("https://acme.wd5.myworkdayjobs.com/x/job/y")).toBe("Acme");
    expect(companyFromUrl("https://boards.greenhouse.io/data-bricks/jobs/1")).toBe("Data Bricks");
    expect(companyFromUrl("https://jobs.lever.co/figma/abc/apply")).toBe("Figma");
    expect(companyFromUrl("https://jobs.ashbyhq.com/ramp/uuid/application")).toBe("Ramp");
  });

  it("splits common title separators", () => {
    expect(splitRoleAndCompany("Engineer - Acme")).toEqual({ role: "Engineer", company: "Acme" });
    expect(splitRoleAndCompany("Engineer | Acme")).toEqual({ role: "Engineer", company: "Acme" });
    expect(splitRoleAndCompany("Engineer @ Acme")).toEqual({ role: "Engineer", company: "Acme" });
    expect(splitRoleAndCompany("Just a role")).toEqual({ role: "Just a role", company: "" });
  });
});
