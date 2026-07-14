import type { ExtensionMessageResponse } from "@jobposted/shared";

export type AutofillContentResponse = Extract<ExtensionMessageResponse, { type: "AUTOFILL_ACTIVE_TAB" }>;

export interface AutofillFrameError {
  error: unknown;
  timedOut?: boolean;
}

export function scoreAutofillResult(response: AutofillContentResponse) {
  const result = response.result;
  if (result.total === 0) return -100;
  return result.filled * 10 + result.needsUser * 4 + result.failed * 2 + result.total - result.skipped * 2;
}

export function bestAutofillResponse(responses: AutofillContentResponse[]) {
  return responses.reduce((best, response) =>
    scoreAutofillResult(response) > scoreAutofillResult(best) ? response : best,
  );
}

export function selectAutofillFrameResponse(args: {
  responses: AutofillContentResponse[];
  errors?: AutofillFrameError[];
}) {
  if (args.responses.length === 0) return null;
  const fieldBearing = args.responses.filter((response) => response.result.total > 0);
  if (fieldBearing.length > 0) return bestAutofillResponse(fieldBearing);
  const timedOut = args.errors?.some((error) => error.timedOut);
  return timedOut ? null : bestAutofillResponse(args.responses);
}

export function isAutofillTimeoutError(error: unknown) {
  return error instanceof Error && /^autofill_frame_timeout:/.test(error.message);
}
