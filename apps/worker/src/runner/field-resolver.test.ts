import { describe, expect, it } from "vitest";
import { answerToString, pickOption, planFormFill, resolveFieldValue, type MasterProfile, type ResolvableField } from "./field-resolver.js";

function profile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    identity: { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "+1 555 0100" },
    location: { country: "United States" },
    links: { website: [] },
    workAuth: { authorizedToWork: true, requiresSponsorship: false, country: "United States" },
    experience: [],
    education: [],
    skills: [],
    answers: [{ key: "screening.relocation_open", prompt: "Are you open to relocation?", value: "Yes" }],
    documents: {},
    ...overrides,
  };
}

const field = (over: Partial<ResolvableField> = {}): ResolvableField => ({ label: "", type: "text", ...over });

describe("worker field-resolver (mirror of @jobposted/shared)", () => {
  it("maps work authorization + sponsorship to setup values", () => {
    expect(resolveFieldValue(field({ label: "Are you authorized to work in the US?" }), profile(), { demographicsEnabled: false }).value).toBe(true);
    expect(resolveFieldValue(field({ label: "Do you require visa sponsorship?" }), profile(), { demographicsEnabled: false }).value).toBe(false);
  });

  it("answerToString renders booleans as Yes/No", () => {
    expect(answerToString(true)).toBe("Yes");
    expect(answerToString(false)).toBe("No");
  });

  it("flags a required question it cannot answer (→ review, never blank submit)", () => {
    const plan = planFormFill([field({ label: "Why do you want to work here?", type: "textarea", required: true })], profile(), { demographicsEnabled: false });
    expect(plan.unansweredRequired).toContain("Why do you want to work here?");
  });

  it("treats required demographics as optional (decline acceptable)", () => {
    const plan = planFormFill([field({ label: "Veteran status", type: "select", required: true })], profile(), { demographicsEnabled: false });
    expect(plan.unansweredRequired).toHaveLength(0);
  });

  it("fills an answerable required field and does not flag it", () => {
    const plan = planFormFill([field({ label: "Authorized to work?", type: "select", required: true, options: ["Yes", "No"] })], profile(), { demographicsEnabled: false });
    expect(plan.unansweredRequired).toHaveLength(0);
    expect(plan.fills.some((f) => f.canonicalKey === "workAuth.authorizedToWork")).toBe(true);
  });

  it("maps pronoun questions from setup gender even when demographics are disabled", () => {
    const male = resolveFieldValue(
      field({ label: "Pronouns", type: "checkbox", options: ["He/him", "She/her", "They/them"] }),
      profile({ demographics: { gender: "Male" } }),
      { demographicsEnabled: false },
    );
    const female = resolveFieldValue(
      field({ label: "She/her", context: "Pronouns", type: "checkbox" }),
      profile({ demographics: { gender: "Female" } }),
      { demographicsEnabled: false },
    );

    expect(male).toMatchObject({
      canonicalKey: "answers.profile_pronouns",
      value: "He/him",
      source: "heuristic",
    });
    expect(female).toMatchObject({
      canonicalKey: "answers.profile_pronouns",
      value: "She/her",
      source: "heuristic",
    });
  });

  it("maps company employee connection questions to the setup answer", () => {
    const r = resolveFieldValue(
      field({ label: "Do you know anyone currently employed by this organization?" }),
      profile({
        answers: [
          { key: "screening.company_employee_connection", prompt: "Do you know anyone at this company?", value: "No" },
        ],
      }),
      { demographicsEnabled: false },
    );

    expect(r.source).toBe("answer");
    expect(r.canonicalKey).toBe("answers.screening.company_employee_connection");
    expect(r.value).toBe("No");
  });

  it("maps previous employment and outside business activity questions to setup answers", () => {
    const p = profile({
      answers: [
        { key: "screening.previous_company_employment", prompt: "Have you been employed by this company in the past?", value: "No" },
        { key: "screening.outside_business_activities", prompt: "Do you have any outside business activities you would continue if hired?", value: "No" },
      ],
    });
    const previous = resolveFieldValue(field({ label: "Have you been employed by Okta, Inc. or any of its subsidiaries in the past?" }), p, { demographicsEnabled: false });
    const outside = resolveFieldValue(field({ label: "Do you have any outside business activity(ies) that you would continue engaging in if you joined us?" }), p, { demographicsEnabled: false });

    expect(previous.canonicalKey).toBe("answers.screening.previous_company_employment");
    expect(previous.value).toBe("No");
    expect(outside.canonicalKey).toBe("answers.screening.outside_business_activities");
    expect(outside.value).toBe("No");
  });

  it("defaults company-specific previous employment to No unless work experience matches the company", () => {
    const noMatch = resolveFieldValue(
      field({ label: "Do you currently or have you previously worked for Databricks in the past?", options: ["Yes", "No"] }),
      profile({
        experience: [{ title: "Engineer", company: "ION Group", startDate: "2022-01", endDate: null, current: true, bullets: [] }],
        answers: [],
      }),
      { demographicsEnabled: false },
    );
    const matched = resolveFieldValue(
      field({ label: "Do you currently or have you previously worked for Databricks in the past?", options: ["Yes", "No"] }),
      profile({
        experience: [{ title: "Engineer", company: "data bricks", startDate: "2021-01", endDate: "2022-01", current: false, bullets: [] }],
        answers: [],
      }),
      { demographicsEnabled: false },
    );

    expect(noMatch.canonicalKey).toBe("answers.screening.previous_company_employment");
    expect(noMatch.value).toBe("No");
    expect(matched.canonicalKey).toBe("answers.screening.previous_company_employment");
    expect(matched.value).toBe("Yes");
  });

  it("answers non-compete, affiliated-company, and ex-employee questions with the setup default (No)", () => {
    const p = profile({
      answers: [
        { key: "screening.non_compete_agreement", prompt: "Do you have any non-compete agreement?", value: "No" },
        { key: "screening.affiliated_company_employment", prompt: "Do you work for any affiliated companies?", value: "No" },
        { key: "screening.previous_company_employment", prompt: "Have you been employed by this company in the past?", value: "No" },
      ],
    });
    const nonCompete = resolveFieldValue(field({ label: "Are you currently bound by a non-compete agreement with a prior employer?" }), p, { demographicsEnabled: false });
    const affiliated = resolveFieldValue(field({ label: "Do you currently work for any affiliated companies of this organization?" }), p, { demographicsEnabled: false });
    const exEmployee = resolveFieldValue(field({ label: "Are you an ex-employee of this company?" }), p, { demographicsEnabled: false });

    expect(nonCompete.canonicalKey).toBe("answers.screening.non_compete_agreement");
    expect(nonCompete.value).toBe("No");
    expect(affiliated.canonicalKey).toBe("answers.screening.affiliated_company_employment");
    expect(affiliated.value).toBe("No");
    // "ex-employee" reuses the previous-employment answer.
    expect(exEmployee.canonicalKey).toBe("answers.screening.previous_company_employment");
    expect(exEmployee.value).toBe("No");
  });

  it("answers AI opt-out and future-role contact consent questions with safe defaults", () => {
    const aiOptOut = resolveFieldValue(
      field({
        label: "Do you request to opt-out of the use of artificial intelligence in the recruitment process?",
        type: "select",
        options: ["I wish to opt out", "I do not wish to opt out"],
      }),
      profile(),
      { demographicsEnabled: false },
    );
    const futureContact = resolveFieldValue(
      field({
        label: "Do you agree to be contacted in future if you are a good fit for another role?",
        type: "select",
        options: ["Yes, I agree", "No, I do not agree"],
      }),
      profile(),
      { demographicsEnabled: false },
    );

    expect(aiOptOut).toMatchObject({
      canonicalKey: "answers.screening.ai_recruiting_opt_out",
      value: "I do not wish to opt out",
      source: "heuristic",
    });
    expect(futureContact).toMatchObject({
      canonicalKey: "answers.screening.future_role_contact_consent",
      value: "Yes, I agree",
      source: "heuristic",
    });
  });

  it("defaults Lever company-background radios to the safest negative option", () => {
    const p = profile({
      answers: [{ key: "screening.company_employee_connection", prompt: "Do you know anyone at this company?", value: "Yes" }],
    });
    const previousEmployee = resolveFieldValue(
      field({
        label: "Are you a current or previous employee of Dun & Bradstreet?",
        type: "radio",
        options: [
          "No previous work experience with the company",
          "Former employee or intern",
          "Former contractor",
          "Current employee or intern",
          "Current contractor",
        ],
      }),
      p,
      { demographicsEnabled: false },
    );
    const family = resolveFieldValue(
      field({
        label: "Do you have a family member or relative who is currently employed by Dun & Bradstreet?",
        type: "radio",
        options: ["Yes", "No"],
      }),
      p,
      { demographicsEnabled: false },
    );
    const referral = resolveFieldValue(
      field({
        label: "Did a current Dun & Bradstreet employee influence you to apply or refer you to the company/role?",
        type: "radio",
        options: ["Yes", "No"],
      }),
      p,
      { demographicsEnabled: false },
    );
    const referralName = resolveFieldValue(
      field({
        label: "If you were referred by a Dun & Bradstreet employee, please list their name:",
        type: "text",
      }),
      p,
      { demographicsEnabled: false },
    );

    expect(previousEmployee).toMatchObject({
      canonicalKey: "answers.screening.previous_company_employment",
      value: "No",
    });
    expect(family).toMatchObject({
      canonicalKey: "answers.screening.company_relative_connection",
      value: "No",
      source: "heuristic",
    });
    expect(referral).toMatchObject({
      canonicalKey: "answers.screening.company_employee_connection",
      value: "No",
      source: "heuristic",
    });
    expect(referralName.canonicalKey).toBe("unknown");
  });

  it("does not infer prior employment from generic current-company wording", () => {
    const p = profile({
      location: { city: "Austin", country: "United States" },
      answers: [],
      experience: [{ title: "Engineer", company: "Current Co", startDate: "2024-01", endDate: null, current: true, bullets: [] }],
    });
    const previousEmployee = resolveFieldValue(
      field({
        label: "Are you a current or previous employee of Dun & Bradstreet?",
        context: "Current company",
        type: "radio",
        options: ["No previous work experience with the company", "Current employee or intern"],
      }),
      p,
      { demographicsEnabled: false },
    );
    const currentLocation = resolveFieldValue(field({ label: "Current location", type: "text" }), p, { demographicsEnabled: false });

    expect(previousEmployee).toMatchObject({
      canonicalKey: "answers.screening.previous_company_employment",
      value: "No",
    });
    expect(currentLocation).toMatchObject({
      canonicalKey: "location.city",
      value: "Austin",
    });
  });

  it("falls back to Yes/No for AI opt-out and future contact questions when those are the only choices", () => {
    const aiOptOut = resolveFieldValue(
      field({
        label: "Do you want to opt out of AI use during hiring?",
        type: "select",
        options: ["Yes", "No"],
      }),
      profile(),
      { demographicsEnabled: false },
    );
    const futureContact = resolveFieldValue(
      field({
        label: "May we contact you about future opportunities?",
        type: "radio",
        options: ["Yes", "No"],
      }),
      profile(),
      { demographicsEnabled: false },
    );

    expect(aiOptOut.value).toBe("No");
    expect(futureContact.value).toBe("Yes");
  });

  it("does not answer open-ended AI questions with the opt-out default", () => {
    const r = resolveFieldValue(
      field({
        label: "Do you request to opt-out of the use of artificial intelligence in the recruitment process?",
        type: "textarea",
      }),
      profile(),
      { demographicsEnabled: false },
    );
    expect(r.canonicalKey).toBe("unknown");
  });

  it("answers current-firm questions from the current or latest organization", () => {
    const p = profile({
      experience: [
        { title: "Engineer", company: "Past Co", startDate: "2021-01", endDate: "2023-12", current: false, bullets: [] },
        { title: "Staff Engineer", company: "Current Co", startDate: "2024-01", endDate: null, current: true, bullets: [] },
      ],
    });
    const current = resolveFieldValue(field({ label: "Current firm you're part of?" }), p, { demographicsEnabled: false });
    expect(current.canonicalKey).toBe("experience.currentCompany");
    expect(current.value).toBe("Current Co");

    const ashbyCurrentOrLast = resolveFieldValue(field({ label: "Current or last company you worked for" }), p, { demographicsEnabled: false });
    expect(ashbyCurrentOrLast.canonicalKey).toBe("experience.currentCompany");
    expect(ashbyCurrentOrLast.value).toBe("Current Co");

    const latest = resolveFieldValue(
      field({ label: "Name of your current employer" }),
      profile({
        experience: [
          { title: "Engineer", company: "Older Co", startDate: "2020-01", endDate: "2021-12", current: false, bullets: [] },
          { title: "Lead Engineer", company: "Latest Co", startDate: "2022-01", endDate: "2023-12", current: false, bullets: [] },
        ],
      }),
      { demographicsEnabled: false },
    );
    expect(latest.canonicalKey).toBe("experience.currentCompany");
    expect(latest.value).toBe("Latest Co");
  });

  it("answers current and expected salary questions separately; generic salary stays review-only", () => {
    const withSalary = profile({ compensation: { currentMin: 90000, expectedMin: 130000 } });
    const current = planFormFill([field({ label: "Current package", required: true })], withSalary, { demographicsEnabled: false });
    expect(current.unansweredRequired).toHaveLength(0);
    expect(current.fills.some((f) => f.canonicalKey === "compensation.current" && f.value === "90000")).toBe(true);

    const a = planFormFill([field({ label: "Expected base salary", required: true })], withSalary, { demographicsEnabled: false });
    expect(a.unansweredRequired).toHaveLength(0);
    expect(a.fills.some((f) => f.canonicalKey === "compensation.expected" && f.value === "130000")).toBe(true);

    const generic = planFormFill([field({ label: "Salary", required: true })], withSalary, { demographicsEnabled: false });
    expect(generic.unansweredRequired).toContain("Salary");

    const b = planFormFill([field({ label: "Expected base salary", required: true })], profile(), { demographicsEnabled: false });
    expect(b.unansweredRequired).toContain("Expected base salary");
  });

  it("answers salary currency questions and matches currency options", () => {
    const withCurrency = profile({ compensation: { currentCurrency: "CAD", currency: "INR" } });
    const current = planFormFill([field({ label: "Current salary currency", required: true })], withCurrency, { demographicsEnabled: false });
    expect(current.unansweredRequired).toHaveLength(0);
    expect(current.fills.some((f) => f.canonicalKey === "compensation.currentCurrency" && f.value === "CAD")).toBe(true);

    const expected = planFormFill([field({ label: "Salary currency", required: true })], withCurrency, { demographicsEnabled: false });
    expect(expected.unansweredRequired).toHaveLength(0);
    expect(expected.fills.some((f) => f.canonicalKey === "compensation.expectedCurrency" && f.value === "INR")).toBe(true);
    expect(pickOption("INR", ["US Dollar (USD)", "Indian Rupee (INR)"])).toBe("Indian Rupee (INR)");
  });

  it("pickOption matches Yes/No + exact, null otherwise", () => {
    expect(pickOption("Yes", ["Yes", "No"])).toBe("Yes");
    expect(pickOption("No", ["I am authorized", "No"])).toBe("No");
    expect(pickOption("I do not wish to opt out", ["I wish to opt out", "I do not wish to opt out"])).toBe("I do not wish to opt out");
    expect(pickOption("Yes, I agree", ["Yes, I agree", "No, I do not agree"])).toBe("Yes, I agree");
    expect(pickOption("Maybe", ["Yes", "No"])).toBeNull();
  });
});
