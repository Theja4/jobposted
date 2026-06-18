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
});
