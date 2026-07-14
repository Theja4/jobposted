import type { ExtensionAutofillRunResult } from "@jobposted/shared";
import { describe, expect, it } from "vitest";
import {
  selectAutofillFrameResponse,
  type AutofillContentResponse,
} from "./frame-autofill";

function response(overrides: Partial<ExtensionAutofillRunResult>): AutofillContentResponse {
  const total = overrides.total ?? overrides.fields?.length ?? 0;
  return {
    ok: true,
    type: "AUTOFILL_ACTIVE_TAB",
    result: {
      platform: "greenhouse",
      stepName: "Apply",
      jobUrl: "https://job-boards.greenhouse.io/embed/job_app?for=coinbase&token=1",
      company: "Coinbase",
      role: "Accountant",
      fields: [],
      filled: 0,
      needsUser: 0,
      skipped: 0,
      failed: 0,
      total,
      tracker: null,
      trackerError: null,
      ...overrides,
    },
  };
}

describe("autofill frame response selection", () => {
  it("prefers a timed-out field-bearing frame over zero-field auxiliary frames", () => {
    const zero = response({ total: 0 });
    const partial = response({
      fields: [
        {
          signature: "company-name-0",
          label: "Company name",
          required: true,
          canonicalKey: "experience",
          status: "filled",
          confidence: 0.94,
          source: "adapter",
        },
      ],
      filled: 1,
      total: 1,
    });

    expect(
      selectAutofillFrameResponse({
        responses: [zero, partial],
        errors: [{ error: new Error("autofill_frame_timeout:3"), timedOut: true }],
      }),
    ).toBe(partial);
  });

  it("does not let zero-field frames mask a timed-out application frame", () => {
    expect(
      selectAutofillFrameResponse({
        responses: [response({ total: 0 })],
        errors: [{ error: new Error("autofill_frame_timeout:5"), timedOut: true }],
      }),
    ).toBeNull();
  });
});
