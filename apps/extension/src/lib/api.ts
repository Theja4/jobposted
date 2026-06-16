import type {
  ExtensionApplicationResponse,
  ExtensionApplicationUpsert,
  ExtensionFieldContext,
  ExtensionFieldMapping,
  ExtensionResumeResponse,
  MasterProfile,
  ReusableAnswer,
} from "@jobposted/shared";
import {
  API_ANSWERS_PATH,
  API_APPLICATIONS_PATH,
  API_FIELD_MAP_PATH,
  API_PROFILE_PATH,
  API_RESUME_PATH,
  JOBPOSTED_WEB_ORIGIN,
} from "../config/env";
import { clearSession, getFreshSession, readCachedProfile, writeCachedProfile } from "./storage";

class ExtensionHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

function apiUrl(path: string) {
  return `${JOBPOSTED_WEB_ORIGIN.replace(/\/$/, "")}${path}`;
}

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getFreshSession();
  if (!session?.accessToken) throw new ExtensionHttpError(401, "not_authenticated");
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
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

  const text = await response.text();
  const body = text ? (JSON.parse(text) as T & { message?: string }) : (null as T);
  if (response.status === 401) {
    await clearSession();
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `request_failed:${response.status}`;
    throw new ExtensionHttpError(response.status, message);
  }
  return body;
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

export async function syncApplication(
  payload: ExtensionApplicationUpsert,
): Promise<ExtensionApplicationResponse> {
  const response = await authedFetch<ExtensionApplicationResponse>(API_APPLICATIONS_PATH, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response;
}

export async function saveAnswer(answer: ReusableAnswer): Promise<void> {
  await authedFetch<{ ok: true }>(API_ANSWERS_PATH, {
    method: "POST",
    body: JSON.stringify(answer),
  });
}

export { ExtensionHttpError };
