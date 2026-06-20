import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { emptyResumeContent, type ResumeContent } from "@jobposted/shared";
import { estimateExperienceYears, measureResumePdf, renderResumePdf } from "./pdf";

function bigResume(jobs: number, bulletsPerJob: number): Partial<ResumeContent> {
  const bullets = Array.from(
    { length: bulletsPerJob },
    (_, i) => `Drove initiative ${i} that delivered measurable, cross-team impact across several quarters and stakeholders`,
  );
  return {
    experience: Array.from({ length: jobs }, (_, i) => ({
      company: `Company ${i}`,
      title: "Staff Software Engineer",
      bullets,
      current: i === 0,
      startDate: `${2008 + i}`,
      endDate: i === 0 ? undefined : `${2010 + i}`,
    })),
  };
}

function sample(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    ...emptyResumeContent(),
    name: "Jane Doe",
    headline: "Senior Frontend Engineer",
    summary: "Frontend engineer focused on accessible, fast React applications.",
    email: "jane@example.com",
    phone: "+1 555 0100",
    location: "Remote",
    links: [{ label: "GitHub", url: "github.com/jane" }],
    skills: ["React", "TypeScript", "Next.js"],
    experience: [
      {
        company: "Acme",
        title: "Software Engineer",
        bullets: ["Built the design system", "Cut bundle size by 30%"],
        current: true,
        startDate: "2021",
      },
    ],
    education: [{ school: "State University", degree: "BS", field: "Computer Science" }],
    ...overrides,
  };
}

describe("renderResumePdf", () => {
  it("produces a valid, single-page PDF for a short resume", async () => {
    const bytes = await renderResumePdf(sample());
    expect(bytes.length).toBeGreaterThan(800);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("handles unicode/punctuation without throwing", async () => {
    const bytes = await renderResumePdf(
      sample({
        summary: "Delivered “features” — improved latency by 40% • across teams …and more.",
      }),
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("renders rich master-resume sections without dropping the document", async () => {
    const bytes = await renderResumePdf(
      sample({
        projects: [
          {
            name: "AI Hiring Insights",
            description: "Matched candidates to roles using resume and job evidence.",
            bullets: ["Built the scoring workflow and review dashboard."],
            technologies: ["Python", "SQL", "Machine learning"],
          },
        ],
        certifications: [{ name: "Certified Scrum Product Owner", issuer: "Scrum Alliance", date: "2020" }],
        languages: ["English", "Hindi", "Telugu"],
        awards: [{ title: "Product Excellence Award", issuer: "Acme", date: "2023" }],
        publications: [{ title: "Practical Product Analytics", publisher: "Internal Guild", date: "2022" }],
        interests: ["Mentoring"],
      }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("page-fit condenses a slightly-overflowing junior resume onto one page", async () => {
    // ~1.x pages of content, <3 years experience → should be condensed to a single page.
    const bullets = Array.from({ length: 5 }, (_, i) => `Shipped meaningful improvement number ${i} that moved a real metric for the team`);
    const experience = Array.from({ length: 3 }, (_, i) => ({
      company: `Startup ${i}`,
      title: "Software Engineer",
      bullets,
      current: i === 0,
      startDate: "2023",
      endDate: i === 0 ? undefined : "2024",
    }));
    const doc = await PDFDocument.load(await renderResumePdf(sample({ experience })));
    expect(doc.getPageCount()).toBe(1);
  });

  it("page-fit expands medium one-page resumes instead of leaving a sparse bottom", async () => {
    const { pages, lastFill } = await measureResumePdf(
      sample({
        headline: "Product Manager",
        summary:
          "Product manager with experience building internal tools, AI workflows, and customer-facing platforms across ambiguous problem spaces.",
        experience: [
          {
            company: "JobPosted",
            title: "Product Manager",
            location: "Remote",
            current: true,
            startDate: "2022",
            bullets: [
              "Led roadmap prioritisation for automation workflows, aligning product strategy with customer feedback and operational constraints.",
              "Worked with engineering to debug API integrations and improve deployment reliability across the production deployment process.",
            ],
          },
          {
            company: "Previous Company",
            title: "Associate Product Manager",
            location: "Remote",
            startDate: "2020",
            endDate: "2022",
            bullets: [
              "Defined PRDs, acceptance criteria, and user stories for high-impact platform features used by internal teams.",
              "Partnered with analytics to measure adoption, success metrics, and customer discovery outcomes.",
            ],
          },
        ],
        education: [{ school: "Vellore Institute of Technology", degree: "B.Tech", startDate: "Jan 2017", endDate: "Jan 2021" }],
        skills: [
          "Roadmap",
          "PRDs",
          "user stories",
          "acceptance criteria",
          "backlog prioritisation",
          "A/B testing",
          "user research",
          "customer discovery",
          "success metrics",
          "MVP delivery",
          "Agile",
          "Scrum",
          "SQL",
          "Python",
          "REST APIs",
          "API debugging",
          "Linux",
          "microservices",
          "RAG",
          "vector embeddings",
          "prompt engineering",
          "LLM evaluation",
          "Tableau",
          "JIRA",
          "Confluence",
          "Postman",
          "Git",
          "Figma",
          "MS Excel",
          "MS PowerPoint",
          "Notion",
          "Slack",
        ],
      }),
    );
    expect(pages).toBe(1);
    expect(lastFill).toBeGreaterThan(0.8);
  });

  it("page-fit keeps a senior, content-rich resume within two pages", async () => {
    const bullets = Array.from({ length: 5 }, (_, i) => `Led initiative ${i} delivering measurable platform impact across multiple teams and quarters`);
    const experience = Array.from({ length: 6 }, (_, i) => ({
      company: `Company ${i}`,
      title: "Staff Engineer",
      bullets,
      current: i === 0,
      startDate: `${2010 + i}`,
      endDate: i === 0 ? undefined : `${2012 + i}`,
    }));
    const doc = await PDFDocument.load(await renderResumePdf(sample({ experience })));
    expect(doc.getPageCount()).toBeLessThanOrEqual(2);
  });

  it("estimateExperienceYears reads the date span", () => {
    const years = estimateExperienceYears(
      sample({
        experience: [
          { company: "A", title: "Eng", bullets: [], startDate: "2015", endDate: "2019" },
          { company: "B", title: "Sr Eng", bullets: [], startDate: "2019", current: true },
        ],
      }),
    );
    expect(years).toBeGreaterThanOrEqual(8);
  });

  it("never orphans a near-empty trailing page across a range of resume sizes", async () => {
    // The exact "two words on page 2 with a big bottom gap" failure: whenever the resume spills to
    // more than one page, the last page must be meaningfully filled (not an orphan).
    for (const [jobs, bullets] of [[1, 2], [3, 4], [5, 5], [8, 6], [12, 6]] as const) {
      const { pages, lastFill } = await measureResumePdf(sample(bigResume(jobs, bullets)));
      expect(pages, `jobs=${jobs} bullets=${bullets}`).toBeGreaterThanOrEqual(1);
      if (pages > 1) {
        expect(lastFill, `jobs=${jobs} bullets=${bullets} pages=${pages}`).toBeGreaterThan(0.25);
      }
    }
  });

  it("fills both pages of a genuine two-page resume", async () => {
    const { pages, lastFill } = await measureResumePdf(sample(bigResume(8, 6)));
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(lastFill).toBeGreaterThan(0.25);
  });
});

describe("renderResumeDocx", () => {
  it("produces a valid .docx (zip/OOXML) file", async () => {
    const { renderResumeDocx } = await import("./docx");
    const bytes = await renderResumeDocx(sample());
    expect(bytes.length).toBeGreaterThan(800);
    // OOXML .docx is a zip → starts with "PK".
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe("PK");
  });
});
