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
    expect(profile.location).toMatchObject({ city: "Hyderabad", country: "India" });
    expect(profile.links.linkedin).toBe("https://linkedin.com/in/theja");
    expect(profile.workAuth).toMatchObject({ authorizedToWork: true, requiresSponsorship: false });
    expect(profile.skills).toEqual(["Product strategy", "Analytics"]);
    expect(profile.experience[0]?.company).toBe("ION Group");
    expect(profile.education[0]?.school).toBe("VIT");
    expect(profile.completeness).toBe(100);
  });
});
