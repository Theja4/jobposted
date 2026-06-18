export const DEFAULT_AUTH_DESTINATION = "/dashboard/jobs";

const LOCAL_ORIGIN = "https://jobposted.local";

export function sanitizeInternalPath(
  path: string | null | undefined,
  fallback = DEFAULT_AUTH_DESTINATION,
) {
  const candidate = path?.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  try {
    const url = new URL(candidate, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function buildPostLoginPath(path: string | null | undefined) {
  const destination = sanitizeInternalPath(path);
  const next = destination.startsWith("/auth/welcome") ? DEFAULT_AUTH_DESTINATION : destination;
  return `/auth/welcome?next=${encodeURIComponent(next)}`;
}
