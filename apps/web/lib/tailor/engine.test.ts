import { describe, expect, it } from "vitest";
import type { ResumeContent, TailorAnalysis } from "@jobposted/shared";
import { applyTailoring } from "./engine";

const resume: ResumeContent = {
  name: "Ada Lovelace",
  headline: "Engineer",
  summary: "Builds reliable systems.",
  email: "ada@example.com",
  phone: "",
  location: "Remote",
  links: [],
  experience: [
    {
      company: "Analytical Engines",
      title: "Engineer",
      bullets: ["Built computation workflows for finance teams."],
    },
  ],
  education: [],
  skills: ["TypeScript", "Reliability", "APIs"],
  projects: [],
  certifications: [],
  languages: [],
  awards: [],
  publications: [],
  interests: [],
  references: [],
};

const analysis: TailorAnalysis = {
  matchScore: 92,
  matchTier: "STRONG_FIT",
  tailoredHeadline: "Reliability Engineer",
  tailoredSummary: "Builds reliable API systems for product teams.",
  skillsOrder: ["APIs", "TypeScript"],
  skillsAdd: [],
  bulletRewrites: [
    {
      company: "Analytical Engines",
      original: "Built computation workflows for finance teams.",
      tailored: "Built reliable computation workflows for finance teams.",
    },
  ],
  missingKeywords: [],
  honestAssessment: "",
};

describe("applyTailoring", () => {
  it("applies supported headline, summary, bullet, and skill ordering", () => {
    const result = applyTailoring(resume, analysis);
    expect(result.changed).toBe(true);
    expect(result.resume.headline).toBe("Reliability Engineer");
    expect(result.resume.experience[0]?.bullets[0]).toBe(
      "Built reliable computation workflows for finance teams.",
    );
    expect(result.resume.skills.slice(0, 2)).toEqual(["APIs", "TypeScript"]);
  });
});
