import { describe, expect, it } from "vitest";
import { buildMasterProfile } from "./profile";

describe("buildMasterProfile", () => {
  it("hydrates voluntary identity answers from the onboarding configuration", () => {
    const profile = buildMasterProfile({
      authEmail: "maya@example.com",
      onboardingData: {
        profile: {
          screening: {
            genderIdentity: "Woman",
            genderIdentityDetail: "",
            disabilityStatus: "Prefer not to say",
            veteranStatus: "No",
            raceEthnicity: "Asian, Hispanic or Latino",
          },
        },
      },
    });

    expect(profile.demographics).toEqual({
      gender: "Female",
      disabilityStatus: "Prefer not to say",
      veteranStatus: "No",
      race: ["Asian", "Hispanic or Latino"],
    });
  });

  it("uses the optional gender detail when Other is selected", () => {
    const profile = buildMasterProfile({
      authEmail: "riley@example.com",
      onboardingData: {
        profile: {
          screening: {
            genderIdentity: "Other",
            genderIdentityDetail: "Non-binary",
          },
        },
      },
    });

    expect(profile.demographics?.gender).toBe("Non-binary");
  });

  it("hydrates explicit work authorization separately from sponsorship", () => {
    const profile = buildMasterProfile({
      authEmail: "casey@example.com",
      profileRow: {
        email: "casey@example.com",
        work_authorization: "not_authorized",
        needs_sponsorship: true,
      },
    });

    expect(profile.workAuth.authorizedToWork).toBe(false);
    expect(profile.workAuth.requiresSponsorship).toBe(true);
  });

  it("keeps authorized-to-work true when sponsorship is also needed", () => {
    const profile = buildMasterProfile({
      authEmail: "dev@example.com",
      profileRow: {
        email: "dev@example.com",
        work_authorization: "authorized",
        needs_sponsorship: true,
      },
    });

    expect(profile.workAuth.authorizedToWork).toBe(true);
    expect(profile.workAuth.requiresSponsorship).toBe(true);
  });

  it("carries resume display names into extension documents", () => {
    const profile = buildMasterProfile({
      authEmail: "dev@example.com",
      resumeUrl: "https://files.example.com/signed",
      resumeName: "Theja Chitturi Resume.pdf",
      coverLetterUrl: "https://files.example.com/cover",
      coverLetterName: "Theja Cover Letter.pdf",
    });

    expect(profile.documents).toMatchObject({
      resumeUrl: "https://files.example.com/signed",
      resumeName: "Theja Chitturi Resume.pdf",
      coverLetterUrl: "https://files.example.com/cover",
      coverLetterName: "Theja Cover Letter.pdf",
    });
  });

  it("falls back to the setup resume name when document metadata has no display name", () => {
    const profile = buildMasterProfile({
      authEmail: "dev@example.com",
      resumeUrl: "https://files.example.com/user/base/84216a92-8aac-4dd8-ad70-a543617bb33e.pdf?token=signed",
      onboardingData: {
        profile: {
          resumeName: "Theja Chitturi Master Resume.pdf",
        },
      },
    });

    expect(profile.documents.resumeName).toBe("Theja Chitturi Master Resume.pdf");
  });

  it("prefers saved onboarding setup and uses its completion score", () => {
    const profile = buildMasterProfile({
      authEmail: "old@example.com",
      profileRow: {
        email: "old@example.com",
        full_name: "Old Profile",
        phone: "",
        location: "",
        work_authorization: "not_authorized",
        needs_sponsorship: true,
      },
      onboardingData: {
        search: {
          workLocations: ["remote"],
          jobTypes: ["fulltime"],
          titles: ["Product Manager"],
        },
        profile: {
          basics: {
            fullName: "Theja Chitturi",
            email: "theja@example.com",
            phone: "+91 73300 07006",
            location: "Hyderabad, India",
            addressLine1: "Flat 301, Jubilee Hills",
            postalCode: "500033",
          },
          links: {
            linkedin: "https://linkedin.com/in/theja",
          },
          workAuth: {
            authorizedToWork: true,
            needsSponsorship: false,
          },
          skills: ["Product strategy", "Analytics"],
          experience: [{ title: "Product Analyst", company: "ION Group", bullets: ["Built workflow tools"] }],
          education: [{ school: "VIT", degree: "B.Tech", field: "Technology" }],
          resumeName: "Theja_Chitturi.pdf",
        },
        final: {
          applicationMode: "auto",
        },
      },
    });

    expect(profile.identity).toMatchObject({
      firstName: "Theja",
      lastName: "Chitturi",
      email: "theja@example.com",
      phone: "+91 73300 07006",
    });
    expect(profile.location).toMatchObject({
      street: "Flat 301, Jubilee Hills",
      city: "Hyderabad",
      postalCode: "500033",
      country: "India",
    });
    expect(profile.links.linkedin).toBe("https://linkedin.com/in/theja");
    expect(profile.workAuth).toMatchObject({ authorizedToWork: true, requiresSponsorship: false });
    expect(profile.skills).toEqual(["Product strategy", "Analytics"]);
    expect(profile.experience[0]?.company).toBe("ION Group");
    expect(profile.education[0]?.school).toBe("VIT");
    expect(profile.completeness).toBe(100);
  });

  it("keeps setup work and education rows authoritative when resume content has extras", () => {
    const profile = buildMasterProfile({
      authEmail: "theja@example.com",
      resumeContent: {
        experience: [
          {
            title: "Product Analyst",
            company: "ION Group",
            location: "Hyderabad, India",
            startDate: "2021-10",
            endDate: "2026-03",
            bullets: ["Resume ION bullet"],
          },
          {
            title: "Product Intern",
            company: "Acme",
            location: "Bengaluru, India",
            startDate: "2020-01",
            endDate: "2021-09",
            bullets: ["Resume Acme bullet"],
          },
        ],
        education: [
          {
            school: "VIT",
            degree: "B.Tech",
            field: "Computer Science",
            startDate: "2017",
            endDate: "2021",
          },
          {
            school: "Delhi Public School",
            degree: "Higher Secondary",
            field: "Science",
            startDate: "2015",
            endDate: "2017",
          },
        ],
      },
      onboardingData: {
        profile: {
          experience: [
            {
              title: "Analyst (Product)",
              company: "ION Group",
              location: "Hyderabad, India",
              startDate: "10/2021",
              endDate: "03/2026",
              bullets: ["Setup ION bullet"],
            },
          ],
          education: [
            {
              school: "VIT",
              degree: "B.Tech",
              field: "Technology",
              startDate: "2017",
              endDate: "2021",
            },
          ],
        },
      },
    });

    expect(profile.experience.map((item) => `${item.title} at ${item.company}`)).toEqual([
      "Analyst (Product) at ION Group",
    ]);
    expect(profile.experience[0]?.bullets).toEqual(["Setup ION bullet"]);
    expect(profile.education.map((item) => item.school)).toEqual(["VIT"]);
    expect(profile.education[0]).toMatchObject({ field: "Technology" });
  });
});
