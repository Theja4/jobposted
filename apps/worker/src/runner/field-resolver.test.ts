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
    expect(pickOption("Maybe", ["Yes", "No"])).toBeNull();
  });
});
