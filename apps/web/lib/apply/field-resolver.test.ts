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
