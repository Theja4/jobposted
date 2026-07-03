import type { ExtensionAutofillPageField, MasterProfile } from "@jobposted/shared";
import { describe, expect, it } from "vitest";
import { buildFallbackAutofillPlan, canSkipMercuryForPlan, normalizeAutofillPlan } from "./planner";

function profile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    identity: {
      firstName: "Asha",
      lastName: "Raman",
      email: "asha@example.com",
      phone: "+1 555 0101",
    },
    location: { city: "San Francisco", state: "CA", country: "United States" },
    links: { website: [] },
    workAuth: { authorizedToWork: null, requiresSponsorship: null, country: "United States" },
    demographics: {},
    experience: [],
    education: [{ school: "University of Nowhere", degree: "Bachelor's Degree", field: "Computer Science" }],
    skills: [],
    answers: [],
    documents: { resumeUrl: "https://files.example.com/resume.pdf", resumeName: "Asha Resume.pdf" },
    ...overrides,
  };
}

function field(partial: Partial<ExtensionAutofillPageField>): ExtensionAutofillPageField {
  return {
    fieldId: partial.fieldId ?? "field",
    label: partial.label ?? "Field",
    type: partial.type ?? "text",
    options: partial.options ?? [],
    optionMode: partial.optionMode ?? null,
    optionDictionary: partial.optionDictionary ?? null,
    optionCount: partial.optionCount ?? null,
    required: partial.required ?? true,
    currentValue: null,
    section: null,
    repeater: partial.repeater ?? null,
    repeaterIndex: partial.repeaterIndex ?? null,
  };
}

describe("autofill plan fallback guardrails", () => {
  it("selects Other for a missing school option and keeps the real school value", () => {
    const plan = buildFallbackAutofillPlan({
      profile: profile(),
      stepName: "Education",
      fields: [
        field({
          fieldId: "school",
          label: "School",
          type: "select",
          options: ["Harvard University", "Stanford University", "Other"],
        }),
      ],
    });

    expect(plan.fields[0]).toMatchObject({
      fieldId: "school",
      action: "select",
      value: "University of Nowhere",
      optionLabel: "Other",
    });
  });

  it("does not fuzzy-match a missing school to a different institution", () => {
    const plan = buildFallbackAutofillPlan({
      profile: profile({
        education: [{ school: "Atlanta Institute of Technology", degree: "Bachelor's Degree", field: "Computer Science" }],
      }),
      stepName: "Education",
      fields: [
        field({
          fieldId: "school",
          label: "School",
          type: "select",
          options: ["Art Institute of Atlanta", "0 - Other"],
        }),
      ],
    });

    expect(plan.fields[0]).toMatchObject({
      fieldId: "school",
      action: "select",
      value: "Atlanta Institute of Technology",
      optionLabel: "0 - Other",
    });
  });

  it("overrides a model-selected unrelated school with deterministic Other fallback", () => {
    const fields = [
      field({
        fieldId: "school",
        label: "School",
        type: "select",
        options: ["Art Institute of Atlanta", "0 - Other"],
      }),
    ];
    const fallback = buildFallbackAutofillPlan({
      profile: profile({
        education: [{ school: "University That Is Not Listed", degree: "Bachelor's Degree", field: "Computer Science" }],
      }),
      stepName: "Education",
      fields,
    });
    const plan = normalizeAutofillPlan({
      fields,
      fallback,
      raw: {
        summary: "Model chose a nearby school.",
        fields: [
          {
            fieldId: "school",
            action: "select",
            value: "University That Is Not Listed",
            optionLabel: "Art Institute of Atlanta",
            confidence: 0.86,
            note: "Bad closest match.",
          },
        ],
      },
    });

    expect(plan.fields[0]).toMatchObject({
      fieldId: "school",
      action: "select",
      value: "University That Is Not Listed",
      optionLabel: "0 - Other",
    });
  });

  it("uses logical defaults for Hispanic/Latino and work authorization when profile is blank", () => {
    const plan = buildFallbackAutofillPlan({
      profile: profile(),
      fields: [
        field({ fieldId: "hispanic", label: "Are you Hispanic/Latino?", type: "radio", options: ["Yes", "No"] }),
        field({ fieldId: "auth", label: "Are you legally authorized to work in the United States?", type: "radio", options: ["Yes", "No"] }),
        field({ fieldId: "sponsor", label: "Will you require visa sponsorship?", type: "radio", options: ["Yes", "No"] }),
      ],
    });

    expect(plan.fields.find((item) => item.fieldId === "hispanic")).toMatchObject({ optionLabel: "No" });
    expect(plan.fields.find((item) => item.fieldId === "auth")).toMatchObject({ optionLabel: "Yes" });
    expect(plan.fields.find((item) => item.fieldId === "sponsor")).toMatchObject({ optionLabel: "No" });
  });

  it("uses repeater indexes for additional education rows", () => {
    const plan = buildFallbackAutofillPlan({
      profile: profile({
        education: [
          { school: "First University", degree: "Bachelor's Degree", field: "Computer Science" },
          { school: "Second Institute", degree: "Master's Degree", field: "Data Science" },
        ],
      }),
      fields: [
        field({
          fieldId: "school-2",
          label: "School",
          type: "text",
          repeater: "education",
          repeaterIndex: 1,
        }),
      ],
    });

    expect(plan.fields[0]).toMatchObject({ value: "Second Institute" });
  });

  it("uses full location context for city comboboxes but only city for text inputs", () => {
    const baseProfile = profile({
      location: { city: "Hyderabad", state: "Telangana", country: "India" },
    });
    const plan = buildFallbackAutofillPlan({
      profile: baseProfile,
      fields: [
        field({
          fieldId: "city-combobox",
          label: "Location (City)",
          type: "combobox",
          options: [],
        }),
        field({
          fieldId: "city-text",
          label: "City",
          type: "text",
        }),
      ],
    });

    expect(plan.fields.find((item) => item.fieldId === "city-combobox")).toMatchObject({
      action: "select",
      value: "Hyderabad, Telangana, India",
    });
    expect(plan.fields.find((item) => item.fieldId === "city-text")).toMatchObject({
      action: "fill",
      value: "Hyderabad",
    });
  });

  it("attaches a resume when Greenhouse exposes the file control label as Attach but the field id is resume", () => {
    const plan = buildFallbackAutofillPlan({
      profile: profile(),
      fields: [
        field({
          fieldId: "resume",
          label: "Attach",
          type: "file",
        }),
      ],
    });

    expect(plan.fields[0]).toMatchObject({
      fieldId: "resume",
      action: "attach",
      value: "Asha Resume.pdf",
      confidence: 0.96,
    });
  });

  it("never free-texts a job title or country into a yes/no screening question", () => {
    const plan = buildFallbackAutofillPlan({
      profile: profile({
        experience: [
          { title: "Full Stack Developer Intern", company: "Acme Corp", startDate: "2020-11", endDate: "2021-05", current: false, bullets: [] },
        ],
        workAuth: { authorizedToWork: null, requiresSponsorship: null, country: "India" },
        location: { city: "Hyderabad", country: "India" },
      }),
      fields: [
        field({
          fieldId: "gov",
          label:
            "Are you a current government official or were you a government official in the last five years (e.g., holder of public office or a civil service position)?",
          type: "select",
          options: ["Yes", "No"],
        }),
        field({
          fieldId: "referral",
          label: "To your knowledge, were you referred to this position by a senior leader?",
          type: "select",
          options: ["Yes", "No"],
        }),
        field({
          fieldId: "conflict",
          label: "Do you maintain a close personal relationship with a senior leader at a company connected to us?",
          type: "select",
          options: ["Yes", "No"],
        }),
        field({
          fieldId: "auth",
          label: "Are you legally authorized to work in the country in which you are applying?",
          type: "select",
          options: ["Yes", "No"],
        }),
      ],
    });
    const byId = (id: string) => plan.fields.find((item) => item.fieldId === id);

    expect(byId("gov")?.optionLabel).toBe("No");
    expect(byId("gov")?.value).not.toBe("Full Stack Developer Intern");
    expect(byId("referral")?.optionLabel).toBe("No");
    expect(byId("conflict")?.optionLabel).toBe("No");
    // "...work in the country..." must be Yes — never the country "India".
    expect(byId("auth")?.optionLabel).toBe("Yes");
    expect(byId("auth")?.value).not.toBe("India");
  });

  it("allows skipping Mercury for profile-backed high-confidence fields", () => {
    const fields = [
      field({ fieldId: "first", label: "First name", type: "text" }),
      field({ fieldId: "email", label: "Email", type: "email" }),
      field({
        fieldId: "auth",
        label: "Are you legally authorized to work in the United States?",
        type: "select",
        options: ["Yes", "No"],
      }),
      field({
        fieldId: "sponsor",
        label: "Will you require visa sponsorship?",
        type: "select",
        options: ["Yes", "No"],
      }),
    ];
    const plan = buildFallbackAutofillPlan({
      profile: profile({
        workAuth: { authorizedToWork: true, requiresSponsorship: false, country: "United States" },
      }),
      fields,
    });

    expect(canSkipMercuryForPlan({ fields, plan })).toBe(true);
  });

  it("keeps Mercury for low-confidence defaults and required unknowns", () => {
    const guessedFields = [
      field({
        fieldId: "gov",
        label: "Are you a current government official?",
        type: "select",
        options: ["Yes", "No"],
      }),
    ];
    const guessedPlan = buildFallbackAutofillPlan({ profile: profile(), fields: guessedFields });
    expect(canSkipMercuryForPlan({ fields: guessedFields, plan: guessedPlan })).toBe(false);

    const unknownFields = [
      field({
        fieldId: "why",
        label: "Why do you want to work here?",
        type: "textarea",
        required: true,
      }),
    ];
    const unknownPlan = buildFallbackAutofillPlan({ profile: profile(), fields: unknownFields });
    expect(canSkipMercuryForPlan({ fields: unknownFields, plan: unknownPlan })).toBe(false);
  });

  it("skips Mercury for deterministic local phone country-code dictionaries", () => {
    const fields = [
      field({
        fieldId: "phone-country",
        label: "Phone country code",
        type: "combobox",
        options: [],
        optionMode: "local_dictionary",
        optionDictionary: "phone_country_code",
        optionCount: 240,
      }),
    ];
    const plan = buildFallbackAutofillPlan({
      profile: profile({
        identity: { firstName: "Asha", lastName: "Raman", email: "asha@example.com", phone: "+91 98765 43210" },
        location: { city: "Hyderabad", country: "India" },
        workAuth: { authorizedToWork: true, requiresSponsorship: false, country: "India" },
      }),
      fields,
    });

    expect(plan.fields[0]).toMatchObject({
      action: "select",
      value: "+91",
      optionLabel: null,
      confidence: 0.94,
    });
    expect(canSkipMercuryForPlan({ fields, plan })).toBe(true);
  });

  it("keeps select actions for partial option payloads when Mercury returns a local value", () => {
    const fields = [
      field({
        fieldId: "country",
        label: "Country",
        type: "combobox",
        options: ["United States", "Canada"],
        optionMode: "ranked_subset",
        optionDictionary: "large_unknown",
        optionCount: 240,
      }),
    ];
    const fallback = buildFallbackAutofillPlan({ profile: profile(), fields });
    const plan = normalizeAutofillPlan({
      fields,
      fallback,
      raw: {
        summary: "Use profile country.",
        fields: [
          {
            fieldId: "country",
            action: "select",
            value: "India",
            optionLabel: null,
            confidence: 0.8,
            note: "Profile country.",
          },
        ],
      },
    });

    expect(plan.fields[0]).toMatchObject({
      action: "select",
      value: "India",
      optionLabel: null,
    });
  });

  it("uses calling-code options for Country fields and national digits for the paired phone field", () => {
    const fields = [
      field({
        fieldId: "country",
        label: "Country",
        type: "combobox",
        options: ["United States +1", "India +91"],
      }),
      field({
        fieldId: "phone",
        label: "Phone",
        type: "phone",
        options: [],
      }),
    ];
    const plan = buildFallbackAutofillPlan({
      profile: profile({
        identity: { firstName: "Asha", lastName: "Raman", email: "asha@example.com", phone: "+91 73300 07006" },
        location: { city: "Hyderabad", country: "India" },
        workAuth: { authorizedToWork: true, requiresSponsorship: false, country: "India" },
      }),
      fields,
    });

    expect(plan.fields.find((item) => item.fieldId === "country")).toMatchObject({
      action: "select",
      value: "+91",
      optionLabel: "India +91",
    });
    expect(plan.fields.find((item) => item.fieldId === "phone")).toMatchObject({
      action: "fill",
      value: "7330007006",
    });
  });

  it("keeps the neutral compliance checkbox answer when Mercury skips a required multiselect", () => {
    const fields = [
      field({
        fieldId: "sanctions",
        label: "Please confirm whether any of the below applies to you. Select all that apply.",
        type: "multiselect",
        options: [
          "Citizen or permanent resident of Cuba, Iran, North Korea, or Syria",
          "Ordinarily a resident of Russia or Belarus and not willing to relocate",
          "None of the above",
        ],
      }),
    ];
    const fallback = buildFallbackAutofillPlan({ profile: profile(), fields });
    const plan = normalizeAutofillPlan({
      fields,
      fallback,
      raw: {
        summary: "Skipped incorrectly.",
        fields: [
          {
            fieldId: "sanctions",
            action: "skip",
            value: null,
            optionLabel: null,
            confidence: 0.4,
            note: "No answer.",
          },
        ],
      },
    });

    expect(plan.fields[0]).toMatchObject({
      action: "select",
      value: ["None of the above"],
      optionLabel: "None of the above",
    });
  });

  it("prefers Not applicable for a compliance follow-up tied to the prior checkbox group", () => {
    const fields = [
      field({
        fieldId: "citizenship-followup",
        label:
          "If you selected a response to the prior question other than none of the above, please confirm whether any of the following also applies to you. Select all that apply.",
        type: "multiselect",
        options: [
          "U.S. citizen",
          "None of these apply to me",
          "Not applicable (i.e., I selected none of the above for the prior question)",
        ],
      }),
    ];
    const plan = buildFallbackAutofillPlan({ profile: profile(), fields });

    expect(plan.fields[0]).toMatchObject({
      action: "select",
      value: ["Not applicable (i.e., I selected none of the above for the prior question)"],
      optionLabel: "Not applicable (i.e., I selected none of the above for the prior question)",
    });
  });

  it("coerces Mercury fill actions on dropdowns into option selections", () => {
    const fields = [
      field({
        fieldId: "gov",
        label: "Are you a current government official?",
        type: "combobox",
        options: [
          "No, I am not a current or former Government Official",
          "Yes, I am a current Government Official",
          "Yes, I am a former Government Official",
        ],
      }),
    ];
    const fallback = buildFallbackAutofillPlan({ profile: profile(), fields });
    const plan = normalizeAutofillPlan({
      fields,
      fallback,
      raw: {
        summary: "AA used the wrong action.",
        fields: [
          {
            fieldId: "gov",
            action: "fill",
            value: "No",
            optionLabel: null,
            confidence: 0.9,
            note: "Should still select.",
          },
        ],
      },
    });

    expect(plan.fields[0]).toMatchObject({
      action: "select",
      value: "No",
      optionLabel: "No, I am not a current or former Government Official",
    });
  });
});

describe("mercury cost controls", () => {
  const identityFields = () => [
    field({ fieldId: "first", label: "First name" }),
    field({ fieldId: "email", label: "Email" }),
    field({ fieldId: "resume", label: "Resume/CV", type: "file" }),
    field({ fieldId: "notice", label: "What is your notice period?", required: false }),
  ];

  it("partitions confident profile fields away from Mercury and keeps open questions", async () => {
    const { partitionPlanFields, buildFallbackAutofillPlan } = await import("./planner");
    const fields = identityFields();
    const plan = buildFallbackAutofillPlan({ fields, profile: profile(), stepName: "Apply" });

    const { unresolved } = partitionPlanFields({ fields, plan });

    const unresolvedIds = unresolved.map((item) => item.fieldId);
    expect(unresolvedIds).toContain("notice");
    expect(unresolvedIds).not.toContain("first");
    expect(unresolvedIds).not.toContain("email");
    // File fields never go to the model.
    expect(unresolvedIds).not.toContain("resume");
  });

  it("honors lockedIds from the answer cache during partition", async () => {
    const { partitionPlanFields, buildFallbackAutofillPlan } = await import("./planner");
    const fields = identityFields();
    const plan = buildFallbackAutofillPlan({ fields, profile: profile(), stepName: "Apply" });

    const { unresolved } = partitionPlanFields({ fields, plan, lockedIds: new Set(["notice"]) });

    expect(unresolved.map((item) => item.fieldId)).not.toContain("notice");
  });

  it("round-trips short field ids", async () => {
    const { withShortFieldIds, restorePlanFieldIds } = await import("./planner");
    const fields = [
      field({ fieldId: "jp-are-you-legally-authorized-to-work-radio-14", label: "Authorized?" }),
      field({ fieldId: "jp-will-you-require-sponsorship-radio-15", label: "Sponsorship?" }),
    ];

    const { shortFields, toOriginal } = withShortFieldIds(fields);
    expect(shortFields.map((item) => item.fieldId)).toEqual(["f0", "f1"]);

    const restored = restorePlanFieldIds(
      { fields: [{ fieldId: "f1", action: "select", value: "No", optionLabel: "No", confidence: 0.9, note: null }] },
      toOriginal,
    ) as { fields: Array<{ fieldId: string }> };
    expect(restored.fields[0]?.fieldId).toBe("jp-will-you-require-sponsorship-radio-15");
  });

  it("slims the profile prompt to what the unresolved fields need", async () => {
    const { profileForPrompt } = await import("./planner");
    const fatProfile = profile({
      experience: Array.from({ length: 8 }, (_, index) => ({
        title: `Engineer ${index}`,
        company: `Company ${index}`,
        startDate: "2020-01",
        endDate: null,
        current: index === 0,
        bullets: ["Did a thing", "Did another thing", "Third thing", "Fourth thing"],
      })),
      skills: Array.from({ length: 80 }, (_, index) => `Skill ${index}`),
      answers: [
        { key: "screening.notice_period", prompt: "Notice period", value: "30 days" },
        ...Array.from({ length: 60 }, (_, index) => ({
          key: `misc.${index}`,
          prompt: `Unrelated question ${index}`,
          value: `Answer ${index}`,
        })),
      ],
    });
    const focus = [field({ fieldId: "notice", label: "What is your notice period?" })];

    const slim = profileForPrompt(fatProfile, focus);

    // No textarea in focus: bullets dropped entirely.
    expect(slim.experience.every((item) => item.bullets.length === 0)).toBe(true);
    // Skills trimmed since no skills-like field is in focus.
    expect(slim.skills.length).toBeLessThanOrEqual(12);
    // The relevant answer survives; the answer list is capped.
    expect(slim.answers.some((answer) => answer.key === "screening.notice_period")).toBe(true);
    expect(slim.answers.length).toBeLessThanOrEqual(40);
    // Without focus the payload keeps the old wide shape.
    expect(profileForPrompt(fatProfile).answers.length).toBe(61);
  });
});

describe("answer cache", () => {
  it("builds signatures from normalized labels and refuses short ones", async () => {
    const { planAnswerSignature } = await import("./planner");
    expect(planAnswerSignature({ label: "Are you legally authorized to work in the U.S.?" })).toBe(
      "plan:v1:are you legally authorized to work in the u s",
    );
    expect(planAnswerSignature({ label: "Name" })).toBeNull();
  });

  it("caches reusable screening answers and refuses job-specific or fragile ones", async () => {
    const { cacheablePlanAnswer } = await import("./planner");
    const sponsorship = field({
      fieldId: "sponsor",
      label: "Will you now or in the future require sponsorship?",
      type: "radio",
      options: ["Yes", "No"],
    });
    const cached = cacheablePlanAnswer(sponsorship, {
      fieldId: "sponsor",
      action: "select",
      value: "No",
      optionLabel: "No",
      confidence: 0.9,
      note: null,
    });
    expect(cached?.signature).toContain("plan:v1:will you now or in the future require sponsorship");
    expect(cached?.answer.value).toBe("No");

    const why = field({ fieldId: "why", label: "Why do you want to work at Acme?", type: "textarea" });
    expect(
      cacheablePlanAnswer(why, { fieldId: "why", action: "fill", value: "Because...", optionLabel: null, confidence: 0.9, note: null }),
    ).toBeNull();

    const startDate = field({ fieldId: "start", label: "What is your earliest start date?" });
    expect(
      cacheablePlanAnswer(startDate, { fieldId: "start", action: "fill", value: "2026-08-01", optionLabel: null, confidence: 0.9, note: null }),
    ).toBeNull();

    const education = field({ fieldId: "degree", label: "Degree", repeater: "education" });
    expect(
      cacheablePlanAnswer(education, { fieldId: "degree", action: "select", value: "BS", optionLabel: "BS", confidence: 0.9, note: null }),
    ).toBeNull();

    const lowConfidence = field({ fieldId: "gov", label: "Are you a government official?" });
    expect(
      cacheablePlanAnswer(lowConfidence, { fieldId: "gov", action: "fill", value: "No", optionLabel: null, confidence: 0.5, note: null }),
    ).toBeNull();
  });

  it("replays cached answers against a different site's options", async () => {
    const { planItemFromCachedAnswer } = await import("./planner");
    const radio = field({
      fieldId: "auth",
      label: "Are you legally authorized to work in the United States?",
      type: "radio",
      options: ["Yes, I am authorized", "No, I am not"],
    });

    const item = planItemFromCachedAnswer(radio, { value: "Yes", optionLabel: "Yes", confidence: 0.9 });

    expect(item?.action).toBe("select");
    expect(item?.optionLabel).toBe("Yes, I am authorized");
    // Confidence is capped below the auto-confidence bar so the panel treats it as reviewable.
    expect(item?.confidence).toBeLessThanOrEqual(0.88);
  });

  it("falls through to Mercury when the cached option does not exist on this site", async () => {
    const { planItemFromCachedAnswer } = await import("./planner");
    const select = field({
      fieldId: "source",
      label: "How did you hear about this role?",
      type: "select",
      options: ["Employee referral", "Job fair"],
    });

    expect(planItemFromCachedAnswer(select, { value: "LinkedIn", optionLabel: "LinkedIn", confidence: 0.9 })).toBeNull();
  });

  it("rejects malformed cached payloads", async () => {
    const { planItemFromCachedAnswer } = await import("./planner");
    const target = field({ fieldId: "pronouns", label: "What are your pronouns?" });
    expect(planItemFromCachedAnswer(target, null)).toBeNull();
    expect(planItemFromCachedAnswer(target, { value: { nested: true }, confidence: 0.9 })).toBeNull();
    expect(planItemFromCachedAnswer(target, { value: "she/her", confidence: 0.4 })).toBeNull();
  });
});
