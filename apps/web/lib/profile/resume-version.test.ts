import { describe, expect, it } from "vitest";
import { resumeContentFromProfilePayload } from "./resume-version";

describe("resumeContentFromProfilePayload", () => {
  it("normalizes profile form payload into resume base content", () => {
    const content = resumeContentFromProfilePayload({
      basics: { fullName: " Ada Lovelace ", email: "ada@example.com" },
      links: { linkedin: "linkedin.com/in/ada", github: "github.com/ada" },
      headline: "Founding Engineer",
      summary: "Builds reliable systems.",
      skills: [" TypeScript ", "", "AI"],
      experience: [
        {
          company: "Analytical Engines",
          title: "Engineer",
          bullets: ["Built computation workflows.", ""],
        },
      ],
      education: [{ school: "University of London", degree: "Math" }],
      projects: [
        {
          name: "Compiler Notes",
          description: "Documented reusable product logic.",
          bullets: ["Published implementation notes."],
          technologies: ["TypeScript"],
        },
      ],
      certifications: [{ name: "Certified Product Owner", issuer: "Scrum Alliance", date: "2021" }],
      languages: ["English", "French"],
      awards: [{ title: "Innovation Award", issuer: "Analytical Engines", date: "2022" }],
      publications: [{ title: "Notes on Engines", publisher: "Internal Journal", date: "2020" }],
      interests: ["Mentoring"],
      references: ["Available on request"],
    });

    expect(content.name).toBe("Ada Lovelace");
    expect(content.skills).toEqual(["TypeScript", "AI"]);
    expect(content.experience?.[0]?.bullets).toEqual(["Built computation workflows."]);
    expect(content.links?.map((link) => link.label)).toEqual(["LinkedIn", "GitHub"]);
    expect(content.projects?.[0]?.name).toBe("Compiler Notes");
    expect(content.certifications?.[0]?.issuer).toBe("Scrum Alliance");
    expect(content.languages).toEqual(["English", "French"]);
    expect(content.awards?.[0]?.title).toBe("Innovation Award");
    expect(content.publications?.[0]?.publisher).toBe("Internal Journal");
    expect(content.interests).toEqual(["Mentoring"]);
    expect(content.references).toEqual(["Available on request"]);
  });
});
