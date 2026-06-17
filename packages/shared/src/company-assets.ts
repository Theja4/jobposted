export interface CompanyAssets {
  companyDomain: string | null;
  companyLogoUrl: string | null;
  companyLogoResolvedAt: string | null;
}

type ResolveOptions = {
  timeoutMs?: number;
};

const ATS_HOST_PATTERNS = [
  /(^|\.)greenhouse\.io$/i,
  /(^|\.)lever\.co$/i,
  /(^|\.)ashbyhq\.com$/i,
  /(^|\.)myworkdayjobs\.com$/i,
  /(^|\.)workdayjobs\.com$/i,
  /(^|\.)smartrecruiters\.com$/i,
  /(^|\.)workable\.com$/i,
];

const LOGO_META_KEYS = new Set([
  "og:image",
  "og:image:secure_url",
  "twitter:image",
  "twitter:image:src",
  "thumbnail",
  "image",
]);

function parseUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

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
  if (!private172) return false;
  const second = Number(private172[1]);
  return second >= 16 && second <= 31;
}

function safeFetchUrl(value: string | null | undefined): URL | null {
  const url = parseUrl(value);
  if (!url || blockedHostname(url.hostname)) return null;
  return url;
}

function stripWww(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function normalizeCompanyAssetUrl(value: string | null | undefined): string | null {
  const url = parseUrl(value);
  if (!url) return null;
  url.hash = "";
  return url.toString();
}

export function isAtsHostedUrl(value: string | null | undefined) {
  const url = parseUrl(value);
  return Boolean(url && ATS_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname)));
}

export function companyCareerPageUrl(applyUrl: string | null | undefined): string | null {
  const url = parseUrl(applyUrl);
  if (!url) return null;

  const firstPathSegment = url.pathname.split("/").filter(Boolean)[0];
  if (ATS_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname)) && firstPathSegment) {
    return new URL(`/${encodeURIComponent(firstPathSegment)}`, url.origin).toString();
  }

  url.hash = "";
  url.search = "";
  return url.toString();
}

export function inferCompanyDomainFromUrl(value: string | null | undefined): string | null {
  const url = parseUrl(value);
  if (!url || ATS_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) return null;
  return stripWww(url.hostname);
}

function attrValue(tag: string, attr: string) {
  const re = new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = tag.match(re);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? "";
}

function absoluteAssetUrl(value: string, baseUrl: string) {
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;
  try {
    return normalizeCompanyAssetUrl(new URL(value, baseUrl).toString());
  } catch {
    return null;
  }
}

function pushUnique(target: string[], value: string | null) {
  if (value && !target.includes(value)) target.push(value);
}

export function parseCompanyAssetsFromHtml(html: string, pageUrl: string): CompanyAssets {
  const logoCandidates: string[] = [];
  const domainCandidates: string[] = [];

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (
      attrValue(tag, "property") ||
      attrValue(tag, "name") ||
      attrValue(tag, "itemprop")
    ).toLowerCase();
    const content = attrValue(tag, "content");
    if (!key || !content) continue;
    if (LOGO_META_KEYS.has(key)) pushUnique(logoCandidates, absoluteAssetUrl(content, pageUrl));
    if (key === "og:url") {
      const domain = inferCompanyDomainFromUrl(content);
      if (domain) pushUnique(domainCandidates, domain);
    }
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attrValue(tag, "rel").toLowerCase();
    const href = attrValue(tag, "href");
    if (!rel || !href) continue;
    if (rel.includes("canonical")) {
      const domain = inferCompanyDomainFromUrl(href);
      if (domain) pushUnique(domainCandidates, domain);
    }
    if (rel.includes("icon")) pushUnique(logoCandidates, absoluteAssetUrl(href, pageUrl));
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const label = `${attrValue(tag, "alt")} ${attrValue(tag, "class")} ${attrValue(tag, "id")}`;
    if (!/\b(logo|brand|company)\b/i.test(label)) continue;
    pushUnique(logoCandidates, absoluteAssetUrl(attrValue(tag, "src"), pageUrl));
  }

  return {
    companyDomain: domainCandidates[0] ?? inferCompanyDomainFromUrl(pageUrl),
    companyLogoUrl: logoCandidates[0] ?? null,
    companyLogoResolvedAt: new Date().toISOString(),
  };
}

export async function resolveCompanyAssetsFromJobUrl(
  args: {
    applyUrl: string | null | undefined;
  },
  options: ResolveOptions = {},
): Promise<CompanyAssets> {
  const pageUrl = companyCareerPageUrl(args.applyUrl);
  const fallback: CompanyAssets = {
    companyDomain: inferCompanyDomainFromUrl(args.applyUrl),
    companyLogoUrl: null,
    companyLogoResolvedAt: new Date().toISOString(),
  };
  if (!pageUrl) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 3500);
  try {
    let current = safeFetchUrl(pageUrl);
    if (!current) return fallback;
    let response: Response | null = null;
    for (let redirect = 0; redirect <= 3; redirect++) {
      response = await fetch(current, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "JobPostedBot/0.1 (+https://jobposted.example)",
        },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      current = location ? safeFetchUrl(new URL(location, current).toString()) : null;
      if (!current) return fallback;
      response = null;
    }
    if (!response) return fallback;
    if (!response.ok) return fallback;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return fallback;
    const html = await response.text();
    const parsed = parseCompanyAssetsFromHtml(html.slice(0, 500_000), current.toString());
    return {
      companyDomain: parsed.companyDomain ?? fallback.companyDomain,
      companyLogoUrl: parsed.companyLogoUrl,
      companyLogoResolvedAt: parsed.companyLogoResolvedAt,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
