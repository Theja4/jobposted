import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_EXTENSION_SETTINGS,
  type ExtensionAuthSession,
  type ExtensionSettings,
  type MasterProfile,
} from "@jobposted/shared";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/env";

const SESSION_KEY = "jobposted.auth.session.v1";
const PROFILE_KEY = "jobposted.profile.cache.v1";
const SETTINGS_KEY = "jobposted.settings.v1";

export interface CachedProfile {
  profile: MasterProfile;
  cachedAt: number;
}

export async function readSession(): Promise<ExtensionAuthSession | null> {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return (result[SESSION_KEY] as ExtensionAuthSession | undefined) ?? null;
}

export async function writeSession(session: ExtensionAuthSession): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove([SESSION_KEY, PROFILE_KEY]);
}

export async function getFreshSession(): Promise<ExtensionAuthSession | null> {
  const session = await readSession();
  if (!session?.accessToken) return null;
  const expiresAt = session.expiresAt ?? 0;
  const shouldRefresh = Boolean(session.refreshToken) && expiresAt - 60 < Date.now() / 1000;
  if (!shouldRefresh) return session;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !session.refreshToken) return session;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: session.refreshToken,
  });
  if (error || !data.session) return session;
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
