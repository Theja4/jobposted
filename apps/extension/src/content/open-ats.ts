import type { PlatformFillStrategy } from "./fill-strategy";
import { fillGreenhouseStructuredFields, prepareGreenhouseStructuredRows } from "./greenhouse-experience";

export const GREENHOUSE_SELECTORS = {
  hostedForm:
    "form[action*='greenhouse' i], #application_form, input[name^='job_application'], input[data-source='first_name']",
  embeddedFrame: "iframe[src*='greenhouse.io' i]",
  firstName:
    "#first_name, input[name='job_application[first_name]'], input[name='first_name'], input[autocomplete='given-name'], input[data-source='first_name']",
  lastName:
    "#last_name, input[name='job_application[last_name]'], input[name='last_name'], input[autocomplete='family-name'], input[data-source='last_name']",
  resume:
    "#resume, input[type='file'][name*='resume' i], input[type='file'][id*='resume' i], input[type='file'][aria-label*='resume' i]",
} as const;

export const LEVER_SELECTORS = {
  hostedForm: "form, input[name='name'], input[name='fullName'], input[name='email']",
  fullName: "input[name='name'], input[name='fullName'], input[autocomplete='name']",
  linkedin: "input[name='urls[LinkedIn]'], input[name*='linkedin' i], input[id*='linkedin' i]",
  resume: "input[type='file'][name*='resume' i], input[type='file'][id*='resume' i], input[type='file'][aria-label*='resume' i]",
} as const;

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function hasHost(hostname: string, suffix: string) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function isGreenhousePage(url: string, doc: Document) {
  const parsed = new URL(url, "https://example.com");
  const host = parsed.hostname.toLowerCase();
  return (
    hasHost(host, "greenhouse.io") ||
    parsed.searchParams.has("gh_jid") ||
    Boolean(doc.querySelector(`${GREENHOUSE_SELECTORS.hostedForm}, ${GREENHOUSE_SELECTORS.embeddedFrame}`))
  );
}

export function isLeverPage(url: string) {
  return hasHost(hostFromUrl(url), "lever.co");
}

export function createGreenhouseFillStrategy(): PlatformFillStrategy {
  return {
    id: "greenhouse",
    preparePage: prepareGreenhouseStructuredRows,
    fillStructuredFields: fillGreenhouseStructuredFields,
  };
}

export function createLeverFillStrategy(): PlatformFillStrategy {
  return { id: "lever" };
}
