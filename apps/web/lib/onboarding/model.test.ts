import { describe, expect, it } from "vitest";
import {
  defaultOnboardingConfig,
  reusableAnswersFromOnboarding,
  sanitizeOnboardingConfig,
} from "./model";

describe("onboarding model", () => {
  it("defaults reusable compliance screening answers to no", () => {
    const config = defaultOnboardingConfig("person@example.com");

    expect(config.profile.screening.knowsCompanyEmployee).toBe(false);
    expect(config.profile.screening.previouslyEmployedByCompany).toBe(false);
    expect(config.profile.screening.outsideBusinessActivities).toBe(false);
    expect(config.profile.screening.nonCompeteAgreement).toBe(false);
    expect(config.profile.screening.worksForAffiliatedCompany).toBe(false);
    expect(reusableAnswersFromOnboarding(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "screening.company_employee_connection",
          value: "No",
        }),
        expect.objectContaining({
          key: "screening.ex_employee",
          value: "No",
        }),
        expect.objectContaining({
          key: "screening.affiliated_company_employment",
          value: "No",
        }),
        expect.objectContaining({
          key: "screening.non_compete_agreement",
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
        expect.objectContaining({
          key: "screening.previous_company_employment",
          value: "No",
        }),
        expect.objectContaining({
          key: "screening.previous_subsidiary_employment",
          value: "No",
        }),
        expect.objectContaining({
          key: "screening.outside_business_activities",
          value: "No",
        }),
        expect.objectContaining({
          key: "screening.side_business_activities",
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
    expect(config.profile.screening.previouslyEmployedByCompany).toBe(false);
    expect(config.profile.screening.outsideBusinessActivities).toBe(false);
  });
});
