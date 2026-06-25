const EMBEDDED_APPLICATION_HOST_SUFFIXES = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "workdayjobs.com",
  "icims.com",
  "workable.com",
  "smartrecruiters.com",
  "taleo.net",
  "oraclecloud.com",
  "successfactors.com",
  "jobvite.com",
  "bamboohr.com",
  "rippling.com",
  "paylocity.com",
];

function hostMatchesSuffix(hostname: string, suffix: string) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function hostnameFromUrl(url: string, baseUrl: string) {
  try {
    return new URL(url, baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isApplicationHostUrl(url: string, baseUrl = globalThis.location?.href ?? "https://example.com/") {
  const hostname = hostnameFromUrl(url, baseUrl);
  return EMBEDDED_APPLICATION_HOST_SUFFIXES.some((suffix) => hostMatchesSuffix(hostname, suffix));
}

export function hasEmbeddedApplicationFrame(doc: Document, baseUrl = globalThis.location?.href ?? "https://example.com/") {
  return Array.from(doc.querySelectorAll<HTMLIFrameElement>("iframe[src]")).some((frame) =>
    isApplicationHostUrl(frame.getAttribute("src") ?? "", baseUrl),
  );
}

export function shouldDeferToEmbeddedApplication(doc: Document, currentUrl: string, isTopFrame: boolean) {
  return isTopFrame && !isApplicationHostUrl(currentUrl, currentUrl) && hasEmbeddedApplicationFrame(doc, currentUrl);
}
