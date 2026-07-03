export interface CompanyAssets {
  companyDomain: string | null;
  companyLogoUrl: string | null;
  companyLogoResolvedAt: string | null;
}

type ResolveOptions = {
  timeoutMs?: number;
  useLogoDevNameFallback?: boolean;
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

const GENERIC_JOB_HOST_PATTERNS = [
  /(^|\.)linkedin\.com$/i,
  /(^|\.)indeed\.com$/i,
  /(^|\.)glassdoor\.com$/i,
  /(^|\.)monster\.com$/i,
  /(^|\.)ziprecruiter\.com$/i,
  /(^|\.)wellfound\.com$/i,
  /(^|\.)angel\.co$/i,
];

const LOGO_META_KEYS = new Set([
  "og:image",
  "og:image:secure_url",
  "twitter:image",
  "twitter:image:src",
  "thumbnail",
  "image",
]);

const KNOWN_COMPANY_DOMAINS = new Map<string, string>([
  ["adobe", "adobe.com"],
  ["airbnb", "airbnb.com"],
  ["amazon", "amazon.com"],
  ["anthropic", "anthropic.com"],
  ["apple", "apple.com"],
  ["atlassian", "atlassian.com"],
  ["block", "block.xyz"],
  ["canva", "canva.com"],
  ["coinbase", "coinbase.com"],
  ["databricks", "databricks.com"],
  ["discord", "discord.com"],
  ["doordash", "doordash.com"],
  ["elevenlabs", "elevenlabs.io"],
  ["figma", "figma.com"],
  ["google", "google.com"],
  ["hubspot", "hubspot.com"],
  ["instacart", "instacart.com"],
  ["linear", "linear.app"],
  ["meta", "meta.com"],
  ["microsoft", "microsoft.com"],
  ["netflix", "netflix.com"],
  ["notion", "notion.so"],
  ["openai", "openai.com"],
  ["paypal", "paypal.com"],
  ["pinterest", "pinterest.com"],
  ["reddit", "reddit.com"],
  ["robinhood", "robinhood.com"],
  ["salesforce", "salesforce.com"],
  ["shopify", "shopify.com"],
  ["slack", "slack.com"],
  ["snowflake", "snowflake.com"],
  ["spotify", "spotify.com"],
  ["square", "squareup.com"],
  ["stripe", "stripe.com"],
  ["tiktok", "tiktok.com"],
  ["twilio", "twilio.com"],
  ["uber", "uber.com"],
  ["zoom", "zoom.us"],
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

  if (GENERIC_JOB_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) return null;

  url.hash = "";
  url.search = "";
  return url.toString();
}

export function inferCompanyDomainFromUrl(value: string | null | undefined): string | null {
  const url = parseUrl(value);
  if (
    !url ||
    ATS_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname)) ||
    GENERIC_JOB_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))
  ) {
    return null;
  }
  return stripWww(url.hostname);
}

function normalizeCompanyNameKey(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co|plc|gmbh|ag|sa|s\.a|pvt|private)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "");
}

export function inferCompanyDomainFromCompanyName(value: string | null | undefined): string | null {
  const key = normalizeCompanyNameKey(value);
  if (!key) return null;
  return KNOWN_COMPANY_DOMAINS.get(key) ?? null;
}

function logoDevPublishableKey() {
  const env = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return (
    env?.LOGO_DEV_PUBLISHABLE_KEY ||
    env?.LOGO_DEV_TOKEN ||
    env?.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY ||
    ""
  ).trim();
}

function logoDevImageUrl(kind: "domain" | "name", value: string | null | undefined, overrideToken?: string) {
  const token = (overrideToken ?? "").trim() || logoDevPublishableKey();
  const cleanValue = (value ?? "").trim();
  if (!token || !cleanValue) return null;
  const path =
    kind === "domain"
      ? encodeURIComponent(stripWww(cleanValue))
      : `name/${encodeURIComponent(cleanValue.slice(0, 120))}`;
  const url = new URL(`https://img.logo.dev/${path}`);
  url.searchParams.set("token", token);
  url.searchParams.set("size", "64");
  url.searchParams.set("format", "webp");
  url.searchParams.set("theme", "light");
  url.searchParams.set("fallback", "404");
  return url.toString();
}

function logoDevFallbackUrl(args: {
  companyDomain: string | null | undefined;
  companyName: string | null | undefined;
  useNameFallback: boolean;
  token?: string;
}) {
  const companyDomain = args.companyDomain ?? inferCompanyDomainFromCompanyName(args.companyName);
  return (
    logoDevImageUrl("domain", companyDomain, args.token) ??
    (args.useNameFallback ? logoDevImageUrl("name", args.companyName, args.token) : null)
  );
}

export function logoDevCompanyLogoUrl(args: {
  companyDomain?: string | null | undefined;
  companyName?: string | null | undefined;
  useNameFallback?: boolean;
  /** Publishable logo.dev token. Falls back to LOGO_DEV_* env when omitted —
   *  clients without process.env (e.g. the extension) pass it explicitly. */
  token?: string;
}) {
  return logoDevFallbackUrl({
    companyDomain: args.companyDomain ?? null,
    companyName: args.companyName ?? null,
    useNameFallback: args.useNameFallback !== false,
    token: args.token,
  });
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
    companyName?: string | null | undefined;
  },
  options: ResolveOptions = {},
): Promise<CompanyAssets> {
  const pageUrl = companyCareerPageUrl(args.applyUrl);
  const fallbackDomain = inferCompanyDomainFromUrl(args.applyUrl);
  const useLogoDevNameFallback = options.useLogoDevNameFallback !== false;
  const fallback: CompanyAssets = {
    companyDomain: fallbackDomain,
    companyLogoUrl: logoDevFallbackUrl({
      companyDomain: fallbackDomain,
      companyName: args.companyName,
      useNameFallback: useLogoDevNameFallback,
    }),
    companyLogoResolvedAt: new Date().toISOString(),
  };
  if (fallback.companyLogoUrl) return fallback;
  if (!pageUrl) return fallback;

  const timeoutMs = options.timeoutMs ?? 3500;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Company asset lookup timed out after ${timeoutMs}ms`));
  }, timeoutMs);
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
    const companyDomain = parsed.companyDomain ?? fallback.companyDomain;
    const logoDevUrl = logoDevFallbackUrl({
      companyDomain,
      companyName: args.companyName,
      useNameFallback: useLogoDevNameFallback,
    });
    return {
      companyDomain,
      companyLogoUrl: logoDevUrl ?? parsed.companyLogoUrl,
      companyLogoResolvedAt: parsed.companyLogoResolvedAt,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
