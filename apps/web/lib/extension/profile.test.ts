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
});
