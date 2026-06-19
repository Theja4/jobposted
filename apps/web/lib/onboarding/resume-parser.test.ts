import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ResumeData } from "@/lib/rezoomed-resume-parser/types";
import { defaultOnboardingConfig } from "./model";
import { mapResumeDataToParsedProfile, mergeParsedIntoOnboarding, parseResumeProfileFromBuffer } from "./resume-parser";

const resume: ResumeData = {
  name: "Aisha Raman",
  email: "aisha@example.com",
  phone: "+1 555 0100",
  location: "San Francisco, CA",
  linkedin: "linkedin.com/in/aisharaman",
  website: "aisharaman.dev",
  summary: "Senior product leader for AI SaaS and fintech analytics platforms.",
  currentRole: "Senior Product Manager",
  experience: [
    {
      company: "Acme AI",
      title: "Senior Product Manager",
      location: "Remote",
      startDate: "2021",
      endDate: "Present",
      bullets: ["Led roadmap for AI analytics products.", "Owned B2B SaaS pricing experiments."],
    },
    {
      company: "Paywell",
      title: "Product Manager",
      location: "New York, NY",
      startDate: "2018",
      endDate: "2021",
      bullets: ["Built payments workflows for fintech customers."],
    },
  ],
  education: [
    {
      institution: "Stanford University",
      degree: "MBA",
      field: "Business",
      startDate: "2016",
      endDate: "2018",
      graduationDate: "2018",
      gpa: "3.8 / 4.0",
    },
  ],
  skills: ["Product strategy"],
  skillSections: [
    {
      title: "Product",
      skills: ["Roadmapping", "Product analytics", "SQL"],
    },
  ],
  certifications: [{ name: "Certified Scrum Product Owner", issuer: "Scrum Alliance", date: "2020" }],
  projects: [
    {
      name: "AI Hiring Insights",
      description: "Matched candidates to roles.",
      bullets: ["Launched matching model."],
      technologies: ["Python", "Machine learning"],
    },
  ],
  languages: ["English", "Hindi"],
  volunteer: [],
  interests: [],
  awards: [],
  publications: [],
  references: [],
  customSections: [],
};

describe("resume onboarding parser mapping", () => {
  it("maps Rezoomed resume data into setup fields beyond basic profile details", () => {
    const parsed = mapResumeDataToParsedProfile(
      resume,
      [
        "GitHub: github.com/aisha",
        "Work authorization: yes",
        "No visa sponsorship required",
        "Open to travel",
        "Relocation: no",
        "Expected salary: $150000 to $170000",
        "Current salary: $120000",
        "Date of birth: 01/01/1994",
        "At least 18 years old",
        "Car driving license",
        "Security Clearance: Secret",
      ].join("\n"),
    );

    expect(parsed.basics).toMatchObject({
      fullName: "Aisha Raman",
      email: "aisha@example.com",
      location: "San Francisco, CA",
    });
    expect(parsed.links).toMatchObject({
      linkedin: "https://linkedin.com/in/aisharaman",
      portfolio: "https://aisharaman.dev",
      github: "https://github.com/aisha",
    });
    expect(parsed.search?.titles).toEqual(["Senior Product Manager", "Product Manager"]);
    expect(parsed.search?.workLocations).toEqual(["remote", "onsite_hybrid"]);
    expect(parsed.search?.onsiteLocation).toBe("San Francisco, CA");
    expect(parsed.filters?.seniority).toContain("Mid-to-Senior Level");
    expect(parsed.filters?.industries).toEqual(expect.arrayContaining(["SaaS", "Fintech", "AI"]));
    expect(parsed.filters?.languages).toEqual(["English", "Hindi"]);
    expect(parsed.filters?.includeKeywords).toEqual(
      expect.arrayContaining(["Roadmapping", "Product analytics", "SQL", "Python", "Machine learning"]),
    );
    expect(parsed.projects?.[0]).toMatchObject({
      name: "AI Hiring Insights",
      technologies: ["Python", "Machine learning"],
    });
    expect(parsed.certifications?.[0]).toMatchObject({
      name: "Certified Scrum Product Owner",
      issuer: "Scrum Alliance",
    });
    expect(parsed.languages).toEqual(["English", "Hindi"]);
    expect(parsed.workAuth).toMatchObject({
      authorizedToWork: true,
      needsSponsorship: false,
      relocationOk: false,
      currentSalaryMin: 120000,
      currentSalaryCurrency: "USD",
      salaryMin: 150000,
      salaryMax: 170000,
      salaryCurrency: "USD",
    });
    expect(parsed.screening).toMatchObject({
      travelOk: true,
      relocationOk: false,
      spokenLanguages: ["English", "Hindi"],
      dateOfBirth: "01/01/1994",
      gpa: "3.8 / 4.0",
      over18: true,
      drivingLicenses: ["Car"],
      securityClearance: "Security Clearance: Secret",
    });
    expect(parsed.experience?.[0]).toMatchObject({ current: true, company: "Acme AI" });
    expect(parsed.education?.[0]).toMatchObject({ school: "Stanford University", degree: "MBA" });
  });

  it("infers setup currency and on-site preference from a known resume country", () => {
    const parsed = mapResumeDataToParsedProfile(
      {
        ...resume,
        location: "Bengaluru, India",
        experience: resume.experience.map((item) => ({ ...item, location: "Bengaluru, India" })),
      },
      "Expected salary: 2500000 to 3200000\nCurrent salary: 1800000",
    );

    expect(parsed.search?.workLocations).toEqual(["onsite_hybrid"]);
    expect(parsed.search?.onsiteLocation).toBe("Bengaluru, India");
    expect(parsed.workAuth).toMatchObject({
      currentSalaryMin: 1800000,
      currentSalaryCurrency: "INR",
      salaryMin: 2500000,
      salaryMax: 3200000,
      salaryCurrency: "INR",
    });
  });

  it("merges parsed setup fields into the onboarding config", () => {
    const current = defaultOnboardingConfig("fallback@example.com");
    const merged = mergeParsedIntoOnboarding(
      current,
      mapResumeDataToParsedProfile(resume, "No visa sponsorship required\nOpen to travel"),
    );

    expect(merged.search.titles).toEqual(["Senior Product Manager", "Product Manager"]);
    expect(merged.filters.languages).toEqual(["English", "Hindi"]);
    expect(merged.profile.basics.email).toBe("aisha@example.com");
    expect(merged.profile.screening.spokenLanguages).toEqual(["English", "Hindi"]);
    expect(merged.profile.workAuth.authorizedToWork).toBe(true);
    expect(merged.profile.workAuth.needsSponsorship).toBe(false);
  });

  it("parses a Rezoomed-exported PDF from the embedded first-party metadata marker", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    const payload = {
      v: 1,
      d: resume,
      c: null,
      s: [],
      b: [],
    };
    const token = Buffer.from(JSON.stringify(payload))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    pdf.setKeywords([`x1.1.1.${token}`]);
    pdf.setSubject("");
    pdf.setCreator("Rezoomed");

    const parsed = await parseResumeProfileFromBuffer({
      buffer: Buffer.from(await pdf.save()),
      fileName: "rezoomed-export.pdf",
      contentType: "application/pdf",
    });

    expect(parsed.diagnostics.source).toBe("marker");
    expect(parsed.parsed.basics).toMatchObject({
      fullName: "Aisha Raman",
      email: "aisha@example.com",
    });
    expect(parsed.parsed.search?.titles).toEqual(["Senior Product Manager", "Product Manager"]);
  });

  it("does not reject selectable low-text PDFs as scanned before parsing", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Aisha Raman", { x: 72, y: 720, size: 12, font });
    page.drawText("aisha@example.com", { x: 72, y: 700, size: 12, font });
    page.drawText("Product Manager", { x: 72, y: 680, size: 12, font });

    const parsed = await parseResumeProfileFromBuffer({
      buffer: Buffer.from(await pdf.save()),
      fileName: "short-text.pdf",
      contentType: "application/pdf",
    });

    expect(parsed.diagnostics.source).toBe("fast");
    expect(parsed.parsed.basics).toMatchObject({
      fullName: "Aisha Raman",
      email: "aisha@example.com",
    });
  });

  it("still rejects truly image-only PDFs as scanned", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const pixel = await pdf.embedPng(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    page.drawImage(pixel, { x: 72, y: 72, width: 200, height: 200 });

    try {
      await expect(
        parseResumeProfileFromBuffer({
          buffer: Buffer.from(await pdf.save()),
          fileName: "image-only.pdf",
          contentType: "application/pdf",
        }),
      ).rejects.toMatchObject({ code: "scanned_pdf" });
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
