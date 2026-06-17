import { NextResponse } from "next/server";
import { normalizeCompanyAssetUrl } from "@jobposted/shared";

export const runtime = "nodejs";

const MAX_BYTES = 1_500_000;
const IMAGE_EXTENSION_RE = /\.(avif|gif|ico|jpe?g|png|svg|webp)(\?|$)/i;

function blockedHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80") ||
    host.endsWith(".local")
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,2})\./);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function safeUrl(value: string | null) {
  const normalized = normalizeCompanyAssetUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (blockedHostname(url.hostname)) return null;
  return url;
}

async function fetchLogo(url: URL, redirects = 0): Promise<Response | null> {
  if (redirects > 3) return null;
  const response = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*;q=0.8,*/*;q=0.4",
      "User-Agent": "JobPostedBot/0.1 (+https://jobposted.example)",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    const next = location ? safeUrl(new URL(location, url).toString()) : null;
    return next ? fetchLogo(next, redirects + 1) : null;
  }

  return response;
}

export async function GET(request: Request) {
  const source = safeUrl(new URL(request.url).searchParams.get("url"));
  if (!source) {
    return NextResponse.json({ ok: false, message: "Invalid logo URL." }, { status: 400 });
  }

  try {
    const response = await fetchLogo(source);
    if (!response?.ok) return new NextResponse(null, { status: 404 });

    const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/") && !IMAGE_EXTENSION_RE.test(source.pathname)) {
      return new NextResponse(null, { status: 415 });
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) return new NextResponse(null, { status: 413 });

    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new NextResponse(null, { status: 413 });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Type": contentType || "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
