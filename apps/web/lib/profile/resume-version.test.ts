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
    });

    expect(content.name).toBe("Ada Lovelace");
    expect(content.skills).toEqual(["TypeScript", "AI"]);
    expect(content.experience?.[0]?.bullets).toEqual(["Built computation workflows."]);
    expect(content.links?.map((link) => link.label)).toEqual(["LinkedIn", "GitHub"]);
  });
});
