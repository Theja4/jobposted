import { describe, expect, it } from "vitest";
import {
  answerToString,
  pickOption,
  planFormFill,
  resolveFieldValue,
  type MasterProfile,
  type ResolvableField,
} from "@jobposted/shared";

function profile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    identity: { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "+1 555 0100" },
    location: { city: "Austin", state: "TX", country: "United States" },
    links: { linkedin: "linkedin.com/in/jane", github: "github.com/jane", website: [] },
    workAuth: { authorizedToWork: true, requiresSponsorship: false, country: "United States" },
    experience: [],
    education: [],
    skills: ["React", "TypeScript"],
    answers: [
      { key: "screening.relocation_open", prompt: "Are you open to relocation?", value: "Yes" },
      { key: "screening.security_clearance", prompt: "Enter any security clearance information", value: "None" },
    ],
    documents: {},
    ...overrides,
  };
}

const field = (over: Partial<ResolvableField> = {}): ResolvableField => ({ label: "", type: "text", ...over });

describe("resolveFieldValue", () => {
  it("maps a work-authorization question to the stored answer", () => {
    const r = resolveFieldValue(field({ label: "Are you legally authorized to work in the US?" }), profile(), { demographicsEnabled: false });
    expect(r.canonicalKey).toBe("workAuth.authorizedToWork");
    expect(r.value).toBe(true);
  });

  it("maps a sponsorship question to the stored answer", () => {
    const r = resolveFieldValue(field({ label: "Will you now or in the future require visa sponsorship?" }), profile(), { demographicsEnabled: false });
    expect(r.canonicalKey).toBe("workAuth.requiresSponsorship");
    expect(r.value).toBe(false);
  });

  it("matches a reusable screening answer by prompt", () => {
    const r = resolveFieldValue(field({ label: "Are you open to relocation?" }), profile(), { demographicsEnabled: false });
    expect(r.source).toBe("answer");
    expect(r.value).toBe("Yes");
  });

  it("maps company employee connection questions to the setup answer", () => {
    const r = resolveFieldValue(
      field({ label: "Do you have any relatives currently employed by this organization?" }),
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

  it("does not resolve demographics unless enabled", () => {
    const off = resolveFieldValue(field({ label: "Gender" }), profile(), { demographicsEnabled: false });
    expect(off.canonicalKey).toBe("unknown");
  });
});

describe("compensation.expected", () => {
  it("answers current and expected compensation from separate setup values", () => {
    const p = profile({
      compensation: {
        currentMin: 90000,
        currentMax: 100000,
        currentCurrency: "USD",
        expectedMin: 120000,
        expectedMax: 150000,
        currency: "USD",
      },
    });
    const current = resolveFieldValue(field({ label: "Current CTC" }), p, { demographicsEnabled: false });
    expect(current.canonicalKey).toBe("compensation.current");
    expect(current.value).toBe("90000");

    const r = resolveFieldValue(field({ label: "Expected salary" }), p, { demographicsEnabled: false });
    expect(r.canonicalKey).toBe("compensation.expected");
    expect(r.value).toBe("120000");
  });

  it("answers salary currency dropdowns from setup currency", () => {
    const p = profile({
      compensation: {
        currentMin: 90000,
        currentCurrency: "CAD",
        expectedMin: 120000,
        currency: "INR",
      },
    });
    const current = resolveFieldValue(field({ label: "Current salary currency" }), p, { demographicsEnabled: false });
    expect(current.canonicalKey).toBe("compensation.currentCurrency");
    expect(current.value).toBe("CAD");

    const expected = resolveFieldValue(field({ label: "Salary currency" }), p, { demographicsEnabled: false });
    expect(expected.canonicalKey).toBe("compensation.expectedCurrency");
    expect(expected.value).toBe("INR");
    expect(pickOption(String(expected.value), ["USD - US Dollar", "INR - Indian Rupee"])).toBe("INR - Indian Rupee");
  });

  it("does not guess on a generic salary field", () => {
    const p = profile({ compensation: { expectedMin: 120000 } });
    const r = resolveFieldValue(field({ label: "Salary" }), p, { demographicsEnabled: false });
    expect(r.canonicalKey).toBe("unknown");
    expect(r.value).toBeNull();
  });

  it("a required salary question is flagged when no expectation is set", () => {
    const plan = planFormFill([field({ label: "Desired compensation", required: true })], profile(), { demographicsEnabled: false });
    expect(plan.unansweredRequired).toContain("Desired compensation");
  });

  it("never answers a CURRENT salary question with the expected salary", () => {
    const p = profile({ compensation: { expectedMin: 120000 } });
    const r = resolveFieldValue(field({ label: "Current salary" }), p, { demographicsEnabled: false });
    expect(r.canonicalKey).not.toBe("compensation.expected");
    // A required current-salary question is left for human review.
    const plan = planFormFill([field({ label: "Current annual salary", required: true })], p, { demographicsEnabled: false });
    expect(plan.unansweredRequired).toContain("Current annual salary");
  });

  it("a required salary question is answered when expectation is set", () => {
    const p = profile({ compensation: { expectedMin: 120000 } });
    const plan = planFormFill([field({ label: "Desired compensation", required: true })], p, { demographicsEnabled: false });
    expect(plan.unansweredRequired).toHaveLength(0);
    expect(plan.fills.some((f) => f.canonicalKey === "compensation.expected" && f.value === "120000")).toBe(true);
  });
});

describe("pickOption (radio/checkbox matcher)", () => {
  it("matches exact and Yes/No, returns null when unsure", () => {
    expect(pickOption("Senior", ["Junior", "Senior", "Staff"])).toBe("Senior");
    expect(pickOption("Yes", ["Yes", "No"])).toBe("Yes");
    expect(pickOption("No", ["yes", "no"])).toBe("no");
    expect(pickOption("Maybe", ["Yes", "No"])).toBeNull();
    expect(pickOption("120000", ["$100k-$150k", "$150k+"])).toBeNull();
  });
});

describe("answerToString", () => {
  it("renders booleans as Yes/No and arrays as comma lists", () => {
    expect(answerToString(true)).toBe("Yes");
    expect(answerToString(false)).toBe("No");
    expect(answerToString(["a", "b"])).toBe("a, b");
  });
});

describe("planFormFill (server safety gate)", () => {
  it("fills answerable fields and skips file inputs", () => {
    const plan = planFormFill(
      [
        field({ label: "Email" }),
        field({ label: "Authorized to work?", type: "select", options: ["Yes", "No"] }),
        field({ label: "Resume", type: "file" }),
      ],
      profile(),
      { demographicsEnabled: false },
    );
    const keys = plan.fills.map((f) => f.canonicalKey);
    expect(keys).toContain("identity.email");
    expect(keys).toContain("workAuth.authorizedToWork");
    expect(keys).not.toContain("documents.resume"); // file skipped
    expect(plan.unansweredRequired).toHaveLength(0);
  });

  it("flags a REQUIRED question it cannot answer (→ route to review, never submit blank)", () => {
    const plan = planFormFill(
      [field({ label: "Why do you want to work here?", type: "textarea", required: true })],
      profile(),
      { demographicsEnabled: false },
    );
    expect(plan.unansweredRequired).toContain("Why do you want to work here?");
  });

  it("flags a required work-auth question when the user never set it", () => {
    const p = profile({ workAuth: { authorizedToWork: null, requiresSponsorship: null } });
    const plan = planFormFill(
      [field({ label: "Are you authorized to work in the country?", type: "select", required: true, options: ["Yes", "No"] })],
      p,
      { demographicsEnabled: false },
    );
    expect(plan.unansweredRequired.length).toBe(1);
  });

  it("treats a required demographic/EEO question as optional (decline is acceptable)", () => {
    const plan = planFormFill(
      [field({ label: "Veteran status", type: "select", required: true, options: ["Yes", "No"] })],
      profile(),
      { demographicsEnabled: false },
    );
    expect(plan.unansweredRequired).toHaveLength(0);
  });
});
