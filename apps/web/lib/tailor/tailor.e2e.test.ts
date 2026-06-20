/**
 * End-to-end tailoring check. Mocks ONLY the LLM network boundary (`callGatewayJSON`) and runs the
 * real engine guardrails (`analyzeTailoring`), the real apply step (`applyTailoring`), and the real
 * renderers (PDF / DOCX / HTML). Verifies tailoring is done *properly* (no fabrication leaks) and
 * that the rendered documents are professional and not broken.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ResumeContent, TailorAnalysis } from "@jobposted/shared";

vi.mock("@/lib/ai/gateway", () => ({
  callGatewayJSON: vi.fn(),
  GatewayError: class GatewayError extends Error {},
}));

import { callGatewayJSON } from "@/lib/ai/gateway";
import { tailorResume } from "./engine";
import { renderResumePdf, measureResumePdf } from "./pdf";
import { renderResumeDocx } from "./docx";
import { renderResumeHtml } from "./render";

const mockGateway = vi.mocked(callGatewayJSON);

function baseResume(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    name: "Casey Dev",
    headline: "Frontend Engineer",
    summary: "Frontend engineer building web apps.",
    email: "casey@example.com",
    phone: "+1 555 0100",
    location: "Remote",
    links: [{ label: "GitHub", url: "github.com/casey" }],
    experience: [
      {
        company: "Acme",
        title: "Frontend Engineer",
        startDate: "2022",
        current: true,
        bullets: [
          "Built a React + TypeScript design system and Next.js apps",
          "Optimized the JavaScript bundle and improved CSS performance",
          "Integrated a GraphQL API for the dashboard",
        ],
      },
    ],
    education: [{ school: "State University", degree: "BS", field: "Computer Science" }],
    skills: ["React", "TypeScript", "Next.js", "JavaScript", "CSS"],
    projects: [],
    certifications: [],
    languages: [],
    awards: [],
    publications: [],
    interests: [],
    references: [],
    ...overrides,
  };
}

const JD =
  "We need a Senior Frontend Engineer to own our React + TypeScript design system, Next.js apps, " +
  "and GraphQL-backed dashboards. Kubernetes and Terraform are a plus.";

/** A deliberately over-reaching model response: it tries to fabricate. The engine must strip it. */
function fabricatingAnalysis(): TailorAnalysis {
  return {
    matchScore: 200, // out of range → must clamp to 100
    matchTier: "NONSENSE" as TailorAnalysis["matchTier"], // invalid → must default
    tailoredHeadline: "Senior Frontend Engineer, Design Systems",
    tailoredSummary:
      "Frontend engineer specializing in React and TypeScript design systems and Next.js applications.",
    skillsOrder: ["TypeScript", "React"],
    skillsAdd: ["GraphQL", "Kubernetes"], // GraphQL is in the source; Kubernetes is not
    bulletRewrites: [
      {
        company: "Acme",
        original: "Built a React + TypeScript design system and Next.js apps",
        tailored: "Built and owned a React and TypeScript design system plus Next.js applications",
      }, // legit → applied
      {
        company: "Acme",
        original: "Optimized the JavaScript bundle and improved CSS performance",
        tailored: "Cut bundle size by 250% through JavaScript and CSS optimization",
      }, // invents "250%" → dropped
      {
        company: "Acme",
        original: "Integrated a GraphQL API for the dashboard",
        tailored: "Led [TEAM] to integrate a GraphQL API for the dashboard",
      }, // placeholder → dropped
      {
        company: "Acme",
        original: "Managed a team of 20 engineers",
        tailored: "Directed 20 engineers across multiple teams",
      }, // original isn't a real bullet → dropped
    ],
    missingKeywords: ["Kubernetes", "Terraform"],
    honestAssessment: "Strong direct frontend fit with infra gaps.",
  };
}

describe("E2E: tailoring is done properly (no fabrication leaks)", () => {
  beforeEach(() => mockGateway.mockReset());

  it("strips fabricated numbers, placeholders, invented bullets, and unsupported skills", async () => {
    mockGateway.mockResolvedValue(fabricatingAnalysis());
    const resume = baseResume();
    const { analysis, resume: tailored, changed } = await tailorResume(resume, JD);

    expect(changed).toBe(true);

    // Score/tier sanitized.
    expect(analysis.matchScore).toBe(100);
    expect(analysis.matchTier).toBe("MODERATE_FIT");

    // Only the one honest rewrite survives.
    expect(analysis.bulletRewrites).toHaveLength(1);
    expect(analysis.skillsAdd).toEqual(["GraphQL"]); // Kubernetes (unsupported) dropped

    const bullets = tailored.experience[0]!.bullets;
    expect(bullets).toContain(
      "Built and owned a React and TypeScript design system plus Next.js applications",
    );
    // Fabrications never reach the resume.
    const joined = bullets.join(" | ");
    expect(joined).not.toMatch(/250/);
    expect(joined).not.toMatch(/\[TEAM\]/);
    expect(joined).not.toMatch(/Managed a team of 20|Directed 20 engineers/);
    // The numeric-fabrication and placeholder bullets are left untouched (original text preserved).
    expect(bullets).toContain("Optimized the JavaScript bundle and improved CSS performance");
    expect(bullets).toContain("Integrated a GraphQL API for the dashboard");

    // Headline + summary applied; skills reordered with the supported addition appended.
    expect(tailored.headline).toBe("Senior Frontend Engineer, Design Systems");
    expect(tailored.skills.slice(0, 2)).toEqual(["TypeScript", "React"]);
    expect(tailored.skills).toContain("GraphQL");
    expect(tailored.skills).not.toContain("Kubernetes");
  });

  it("never invents content even if the model returns total garbage", async () => {
    mockGateway.mockResolvedValue({
      matchScore: -50,
      tailoredHeadline: "x".repeat(5),
      bulletRewrites: [
        { company: "Nowhere", original: "Totally made up", tailored: "Also made up, with 99 metrics" },
      ],
      skillsAdd: ["Rust", "Go", "Scala"],
    } as unknown as TailorAnalysis);

    const resume = baseResume();
    const { resume: tailored } = await tailorResume(resume, JD);

    // No fabricated bullet, no unsupported skill leaked.
    expect(tailored.experience[0]!.bullets).toEqual(resume.experience[0]!.bullets);
    for (const bad of ["Rust", "Go", "Scala"]) expect(tailored.skills).not.toContain(bad);
  });
});

describe("E2E: a tailored resume renders professional, non-broken documents", () => {
  beforeEach(() => mockGateway.mockReset());

  async function tailored(): Promise<ResumeContent> {
    mockGateway.mockResolvedValue(fabricatingAnalysis());
    return (await tailorResume(baseResume(), JD)).resume;
  }

  it("renders a valid, single-page PDF that fills the page", async () => {
    const resume = await tailored();
    const bytes = await renderResumePdf(resume);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);

    const { pages, lastFill } = await measureResumePdf(resume);
    expect(pages).toBeGreaterThanOrEqual(1);
    if (pages > 1) expect(lastFill).toBeGreaterThan(0.25); // never orphan a trailing page
  });

  it("renders a valid OOXML .docx", async () => {
    const bytes = await renderResumeDocx(await tailored());
    expect(bytes.length).toBeGreaterThan(800);
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe("PK");
  });

  it("renders clean HTML with no placeholder/fabrication/undefined leakage", async () => {
    const html = renderResumeHtml(await tailored());
    expect(html).toContain("Casey Dev");
    expect(html).toContain("Senior Frontend Engineer, Design Systems");
    expect(html).not.toMatch(/\[TEAM\]|\bTBD\b|\bundefined\b|\bNaN\b|250%/);
  });

  it("escapes HTML so untrusted resume text cannot break or inject markup", () => {
    const html = renderResumeHtml(
      baseResume({
        name: "Casey <script>alert(1)</script> Dev",
        summary: "Shipped A & B <b>features</b> for the team.",
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
  });

  it("renders unicode, smart quotes, and em-dashes in a PDF without throwing", async () => {
    const bytes = await renderResumePdf(
      baseResume({
        summary: "Delivered “features” — improved latency by 40% • across teams …和团队 🚀.",
      }),
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
