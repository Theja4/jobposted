import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_EXTENSION_SETTINGS,
  type ExtensionAuthSession,
  type ExtensionSettings,
  type MasterProfile,
} from "@jobposted/shared";
import { API_SESSION_PATH, JOBPOSTED_WEB_ORIGIN, SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/env";

const SESSION_KEY = "jobposted.auth.session.v1";
const PROFILE_KEY = "jobposted.profile.cache.v1";
const SETTINGS_KEY = "jobposted.settings.v1";

export interface CachedProfile {
  profile: MasterProfile;
  cachedAt: number;
}

type JwtPayload = { exp?: unknown; iss?: unknown };
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jwtPayload(accessToken: string): JwtPayload | null {
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

function jwtExpiresAt(accessToken: string) {
  const decoded = jwtPayload(accessToken);
  return typeof decoded?.exp === "number" && Number.isFinite(decoded.exp) ? decoded.exp : null;
}

function apiUrl(path: string) {
  return `${JOBPOSTED_WEB_ORIGIN.replace(/\/$/, "")}${path}`;
}

function storageKeyFromSupabaseUrl() {
  if (!SUPABASE_URL) return null;
  try {
    const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

function base64UrlToString(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeCookieValue(value: string) {
  const decoded = value.startsWith("base64-") ? base64UrlToString(value.slice("base64-".length)) : value;
  try {
    return JSON.parse(decoded);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(decoded));
    } catch {
      return null;
    }
  }
}

function sessionFromCookiePayload(value: unknown): ExtensionAuthSession | null {
  if (Array.isArray(value)) {
    const accessToken = str(value[0]);
    if (!accessToken) return null;
    return {
      accessToken,
      refreshToken: str(value[1]) || null,
      expiresAt: num(value[2]) ?? jwtExpiresAt(accessToken),
      user: null,
    };
  }

  const root = asRecord(value);
  const session = asRecord(root.currentSession ?? root.session ?? value);
  const accessToken = str(session.access_token ?? session.accessToken);
  if (!accessToken) return null;
  const user = asRecord(session.user);
  const userId = str(user.id);
  return {
    accessToken,
    refreshToken: str(session.refresh_token ?? session.refreshToken) || null,
    expiresAt: num(session.expires_at ?? session.expiresAt ?? root.expiresAt) ?? jwtExpiresAt(accessToken),
    user: userId ? { id: userId, email: str(user.email) || null } : null,
  };
}

function combineCookieChunks(cookies: chrome.cookies.Cookie[], key: string) {
  const byName = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  const whole = byName.get(key);
  if (whole) return whole;

  const chunks: string[] = [];
  for (let index = 0; ; index += 1) {
    const chunk = byName.get(`${key}.${index}`);
    if (!chunk) break;
    chunks.push(chunk);
  }
  return chunks.length > 0 ? chunks.join("") : null;
}

async function readPortalCookieSession(): Promise<ExtensionAuthSession | null> {
  if (!chrome.cookies?.getAll) return null;
  const cookies = await chrome.cookies.getAll({ url: JOBPOSTED_WEB_ORIGIN }).catch(() => []);
  if (cookies.length === 0) return null;

  const configuredKey = storageKeyFromSupabaseUrl();
  const inferredKeys = cookies
    .map((cookie) => cookie.name.replace(/\.\d+$/, ""))
    .filter((name) => /^sb-.+-auth-token$/.test(name));
  const keys = [...new Set([configuredKey, ...inferredKeys].filter((key): key is string => Boolean(key)))];

  for (const key of keys) {
    const combined = combineCookieChunks(cookies, key);
    if (!combined) continue;
    const session = sessionFromCookiePayload(decodeCookieValue(combined));
    if (session?.accessToken) return normalizeSession(session);
  }
  return null;
}

async function refreshViaJobPosted(session: ExtensionAuthSession): Promise<ExtensionAuthSession | null> {
  if (!session.refreshToken) return null;
  const response = await fetch(apiUrl(API_SESSION_PATH), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as { session?: ExtensionAuthSession } | null;
  return body?.session?.accessToken ? normalizeSession(body.session) : null;
}

function supabaseEnvMatchesSession(session: ExtensionAuthSession) {
  if (!SUPABASE_URL) return false;
  const issuer = jwtPayload(session.accessToken)?.iss;
  if (typeof issuer !== "string" || !issuer) return false;
  try {
    return new URL(issuer).hostname === new URL(SUPABASE_URL).hostname;
  } catch {
    return false;
  }
}

function normalizeSession(session: ExtensionAuthSession): ExtensionAuthSession {
  return {
    ...session,
    expiresAt: session.expiresAt ?? jwtExpiresAt(session.accessToken),
  };
}

async function refreshSession(session: ExtensionAuthSession): Promise<ExtensionAuthSession | null> {
  const viaJobPosted = await refreshViaJobPosted(session);
  if (viaJobPosted) {
    await writeSession(viaJobPosted);
    return viaJobPosted;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !session.refreshToken || !supabaseEnvMatchesSession(session)) {
    return null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: session.refreshToken,
  });
  if (error || !data.session) return null;
  const refreshed: ExtensionAuthSession = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user: data.session.user
      ? { id: data.session.user.id, email: data.session.user.email ?? null }
      : session.user,
  };
  await writeSession(refreshed);
  return refreshed;
}

export async function readSession(): Promise<ExtensionAuthSession | null> {
  const result = await chrome.storage.local.get(SESSION_KEY);
  const session = (result[SESSION_KEY] as ExtensionAuthSession | undefined) ?? null;
  return session?.accessToken ? normalizeSession(session) : null;
}

export async function writeSession(session: ExtensionAuthSession): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: normalizeSession(session) });
  await chrome.storage.local.remove(PROFILE_KEY);
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([SESSION_KEY, PROFILE_KEY]);
}

export async function getFreshSession(): Promise<ExtensionAuthSession | null> {
  const session = (await readSession()) ?? (await recoverSessionFromPortalCookies());
  if (!session?.accessToken) return null;
  const now = Date.now() / 1000;
  const expiresAt = session.expiresAt ?? 0;
  // Check expiry independently of whether we hold a refresh token. Gating this on
  // `refreshToken` let an expired access token be served as "authenticated", so the
  // popup showed "Syncing" and then bounced to re-login when the API returned 401.
  const isExpiring = Boolean(expiresAt) && expiresAt - 60 < now;
  if (!isExpiring) return session;
  const refreshed = await refreshSession(session);
  if (refreshed) return refreshed;
  if (expiresAt > now) return session;
  await clearSession();
  return null;
}

export async function refreshStoredSession(): Promise<ExtensionAuthSession | null> {
  const session = await readSession();
  if (!session?.refreshToken) return null;
  return refreshSession(session);
}

export async function recoverSessionFromPortalCookies(): Promise<ExtensionAuthSession | null> {
  const session = await readPortalCookieSession();
  if (!session?.accessToken) return null;
  const refreshed = await refreshSession(session);
  if (refreshed) return refreshed;
  await writeSession(session);
  return session;
}

export async function readCachedProfile(): Promise<CachedProfile | null> {
  const result = await chrome.storage.local.get(PROFILE_KEY);
  return (result[PROFILE_KEY] as CachedProfile | undefined) ?? null;
}

export async function writeCachedProfile(profile: MasterProfile): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: { profile, cachedAt: Date.now() } });
}

export async function readSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = (result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined) ?? {};
  return {
    ...DEFAULT_EXTENSION_SETTINGS,
    ...stored,
    enabledPlatforms: {
      ...DEFAULT_EXTENSION_SETTINGS.enabledPlatforms,
      ...stored.enabledPlatforms,
    },
  };
}

export async function writeSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = {
    ...(await readSettings()),
    ...partial,
    enabledPlatforms: {
      ...(await readSettings()).enabledPlatforms,
      ...partial.enabledPlatforms,
    },
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}
