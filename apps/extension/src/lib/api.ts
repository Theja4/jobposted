import type {
  ExtensionAnswerDraftRequest,
  ExtensionApplicationResponse,
  ExtensionApplicationUpsert,
  ExtensionAutofillPlan,
  ExtensionAutofillPlanRequest,
  ExtensionCoverLetterResponse,
  ExtensionFieldContext,
  ExtensionFieldMapping,
  ExtensionJobContext,
  ExtensionResumeOption,
  ExtensionResumeResponse,
  ExtensionTailorResponse,
  ExtensionTrackerPagination,
  ExtensionTrackerItem,
  MasterProfile,
  ReusableAnswer,
} from "@jobposted/shared";
import {
  API_ANSWERS_PATH,
  API_ANSWER_DRAFT_PATH,
  API_APPLICATIONS_PATH,
  API_RESUMES_PATH,
  API_COVER_LETTER_PATH,
  API_AUTOFILL_PLAN_PATH,
  API_FIELD_MAP_PATH,
  API_PROFILE_PATH,
  API_RESUME_PATH,
  API_TAILOR_PATH,
  JOBPOSTED_WEB_ORIGIN,
} from "../config/env";
import {
  clearSession,
  getFreshSession,
  readCachedProfile,
  recoverSessionFromPortalCookies,
  refreshStoredSession,
  writeCachedProfile,
} from "./storage";

class ExtensionHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

function timeoutForPath(path: string) {
  // AI-backed routes legitimately take longer than a CRUD call. Give them
  // generous client budgets so we never abort before the server returns its
  // plan (or its fast deterministic fallback) and mis-report a "request_timeout".
  if (path === API_AUTOFILL_PLAN_PATH) return 35_000;
  if (path === API_ANSWER_DRAFT_PATH) return 35_000;
  if (path === API_TAILOR_PATH || path === API_COVER_LETTER_PATH) return 90_000;
  return DEFAULT_TIMEOUT_MS;
}

function apiUrl(path: string) {
  return `${JOBPOSTED_WEB_ORIGIN.replace(/\/$/, "")}${path}`;
}

function unavailableRouteMessage(path: string) {
  if (path === API_AUTOFILL_PLAN_PATH) {
    return `Autofill planner route was not found at ${apiUrl(path)}. Run or deploy apps/web with /api/extension/autofill-plan, or rebuild the extension with WXT_JOBPOSTED_WEB_ORIGIN pointing at the right web app.`;
  }
  return `request_failed:404`;
}

async function requestWithToken(path: string, accessToken: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutForPath(path));
  try {
    return await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ExtensionHttpError(408, "request_timeout");
    }
    throw new ExtensionHttpError(0, "network_unavailable");
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function parseResponseBody<T>(text: string): (T & { message?: string; error?: string }) | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T & { message?: string; error?: string };
  } catch {
    return null;
  }
}

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let session = await getFreshSession();
  if (!session?.accessToken) throw new ExtensionHttpError(401, "not_authenticated");

  let response = await requestWithToken(path, session.accessToken, init);
  if (response.status === 401 && session.refreshToken) {
    const refreshed = (await refreshStoredSession()) ?? (await recoverSessionFromPortalCookies());
    if (refreshed?.accessToken && refreshed.accessToken !== session.accessToken) {
      session = refreshed;
      response = await requestWithToken(path, session.accessToken, init);
    }
  }
  if (response.status === 401) {
    const recovered = await recoverSessionFromPortalCookies();
    if (recovered?.accessToken && recovered.accessToken !== session.accessToken) {
      session = recovered;
      response = await requestWithToken(path, session.accessToken, init);
    }
  }

  const text = await response.text();
  const body = parseResponseBody<T>(text);
  if (response.status === 401) {
    await clearSession();
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : response.status === 404
            ? unavailableRouteMessage(path)
            : `request_failed:${response.status}`;
    throw new ExtensionHttpError(response.status, message);
  }
  return body as T;
}

export async function fetchProfile(forceRefresh = false): Promise<MasterProfile> {
  if (!forceRefresh) {
    const cached = await readCachedProfile();
    if (cached && Date.now() - cached.cachedAt < 10 * 60_000) return cached.profile;
  }
  const response = await authedFetch<{ ok: true; profile: MasterProfile }>(API_PROFILE_PATH);
  await writeCachedProfile(response.profile);
  return response.profile;
}

export async function fetchResume(jobId?: string | null): Promise<ExtensionResumeResponse> {
  const qs = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return authedFetch<ExtensionResumeResponse>(`${API_RESUME_PATH}${qs}`);
}

export async function mapField(
  field: ExtensionFieldContext,
  profile: MasterProfile,
): Promise<ExtensionFieldMapping> {
  const response = await authedFetch<{ ok: true; mapping: ExtensionFieldMapping }>(API_FIELD_MAP_PATH, {
    method: "POST",
    body: JSON.stringify({ field, profile }),
  });
  return response.mapping;
}

export async function createAutofillPlan(
  payload: ExtensionAutofillPlanRequest,
): Promise<ExtensionAutofillPlan> {
  const response = await authedFetch<{ ok: true; plan: ExtensionAutofillPlan }>(API_AUTOFILL_PLAN_PATH, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.plan;
}

export async function syncApplication(
  payload: ExtensionApplicationUpsert,
): Promise<ExtensionApplicationResponse> {
  const response = await authedFetch<ExtensionApplicationResponse>(API_APPLICATIONS_PATH, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response;
}

export async function tailorResumeForJob(
  payload: ExtensionJobContext & { jobId?: string | null; applicationId?: string | null },
): Promise<ExtensionTailorResponse> {
  return authedFetch<ExtensionTailorResponse>(API_TAILOR_PATH, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateCoverLetterForJob(
  payload: ExtensionJobContext & { jobId?: string | null; applicationId?: string | null },
): Promise<ExtensionCoverLetterResponse> {
  return authedFetch<ExtensionCoverLetterResponse>(API_COVER_LETTER_PATH, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchTrackerPage(options: {
  stage?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: ExtensionTrackerItem[]; pagination: ExtensionTrackerPagination }> {
  const params = new URLSearchParams();
  if (options.stage) params.set("stage", options.stage);
  if (typeof options.limit === "number") params.set("limit", String(options.limit));
  if (typeof options.offset === "number") params.set("offset", String(options.offset));
  const path = params.size > 0 ? `${API_APPLICATIONS_PATH}?${params.toString()}` : API_APPLICATIONS_PATH;
  const response = await authedFetch<{
    ok: true;
    items: ExtensionTrackerItem[];
    pagination?: ExtensionTrackerPagination;
  }>(path);
  return {
    items: response.items ?? [],
    pagination: response.pagination ?? {
      limit: response.items?.length ?? 0,
      offset: 0,
      total: response.items?.length ?? 0,
      hasMore: false,
    },
  };
}

export async function fetchTrackerItems(): Promise<ExtensionTrackerItem[]> {
  return (await fetchTrackerPage()).items;
}

export async function updateTrackerItem(payload: {
  id: string;
  stage?: string;
  notes?: string | null;
  resumeDocId?: string | null;
}): Promise<ExtensionTrackerItem | null> {
  const response = await authedFetch<{ ok: true; item: ExtensionTrackerItem | null }>(API_APPLICATIONS_PATH, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.item ?? null;
}

export async function fetchResumeOptions(): Promise<ExtensionResumeOption[]> {
  const response = await authedFetch<{ ok: true; resumes: ExtensionResumeOption[] }>(API_RESUMES_PATH);
  return response.resumes ?? [];
}

export async function uploadResume(payload: { name: string; dataBase64: string }): Promise<ExtensionResumeOption | null> {
  const response = await authedFetch<{ ok: true; resume: ExtensionResumeOption | null }>(API_RESUMES_PATH, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.resume ?? null;
}

export async function draftAnswer(payload: ExtensionAnswerDraftRequest): Promise<string> {
  const response = await authedFetch<{ ok: true; answer: string }>(API_ANSWER_DRAFT_PATH, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.answer;
}

export async function saveAnswer(answer: ReusableAnswer): Promise<void> {
  await authedFetch<{ ok: true }>(API_ANSWERS_PATH, {
    method: "POST",
    body: JSON.stringify(answer),
  });
}

export { ExtensionHttpError };
