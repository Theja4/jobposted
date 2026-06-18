import { describe, expect, it } from "vitest";
import {
  defaultOnboardingConfig,
  reusableAnswersFromOnboarding,
  sanitizeOnboardingConfig,
} from "./model";

describe("onboarding model", () => {
  it("defaults company employee connection screening answers to no", () => {
    const config = defaultOnboardingConfig("person@example.com");

    expect(config.profile.screening.knowsCompanyEmployee).toBe(false);
    expect(reusableAnswersFromOnboarding(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "screening.company_employee_connection",
          value: "No",
        }),
        expect.objectContaining({
          key: "screening.company_contact_connection",
          value: "No",
        }),
        expect.objectContaining({
          key: "screening.company_relative_connection",
          value: "No",
        }),
        expect.objectContaining({
          key: "screening.current_employee_connection",
          value: "No",
        }),
      ]),
    );
  });

  it("keeps legacy saved configs on the no default", () => {
    const config = sanitizeOnboardingConfig({
      profile: { screening: {} },
    });

    expect(config.profile.screening.knowsCompanyEmployee).toBe(false);
  });
});
