import type { PlatformAdapter } from "../autofill/types";
import { buttonByText, genericAdvance, genericSubmit } from "./common";

export const workdayAdapter: PlatformAdapter = {
  id: "workday",
  label: "Workday",
  match(url, dom) {
    return (
      /\.myworkdayjobs\.com$/i.test(url.hostname) ||
      Boolean(dom.querySelector("[data-automation-id='workdayApplication']")) ||
      Boolean(dom.querySelector("[data-automation-id='legalNameSection_firstName']"))
    );
  },
  detectStep(dom) {
    const step =
      dom.querySelector("[data-automation-id='progressTrackerActiveStep']")?.textContent ||
      dom.querySelector("[data-automation-id='stepName']")?.textContent ||
      dom.querySelector("h2[data-automation-id], h2, h1")?.textContent ||
      "Workday application";
    const items = Array.from(dom.querySelectorAll("[data-automation-id*='progressTracker']"));
    return { name: step.replace(/\s+/g, " ").trim(), total: items.length || undefined };
  },
  mapFields() {
    return [
      { selector: "[data-automation-id='legalNameSection_firstName'] input, input[data-automation-id='legalNameSection_firstName']", key: "identity.firstName" },
      { selector: "[data-automation-id='legalNameSection_lastName'] input, input[data-automation-id='legalNameSection_lastName']", key: "identity.lastName" },
      { selector: "[data-automation-id='preferredName'] input, input[data-automation-id='preferredName']", key: "identity.preferredName" },
      { selector: "[data-automation-id='email'] input, input[data-automation-id='email']", key: "identity.email" },
      { selector: "[data-automation-id='phone-number'] input, input[data-automation-id='phone-number']", key: "identity.phone" },
      { selector: "[data-automation-id='addressLine1'] input, input[data-automation-id='addressLine1']", key: "location.street" },
      { selector: "[data-automation-id='city'] input, input[data-automation-id='city']", key: "location.city" },
      { selector: "[data-automation-id='postalCode'] input, input[data-automation-id='postalCode']", key: "location.postalCode" },
      { selector: "[data-automation-id='country'] input, [data-automation-id='country'] [role='combobox']", key: "location.country" },
      { selector: "[data-automation-id='resumeUpload'] input[type='file'], input[type='file'][data-automation-id*='resume']", key: "documents.resume" },
      { selector: "[data-automation-id='coverLetterUpload'] input[type='file'], input[type='file'][data-automation-id*='cover']", key: "documents.coverLetter" },
      { selector: "[data-automation-id='linkedinQuestion'] input", key: "links.linkedin" },
      { selector: "[data-automation-id='websiteQuestion'] input", key: "links.portfolio" },
      { selector: "[data-automation-id*='sponsorship'] input", key: "workAuth.requiresSponsorship", confidence: 0.9 },
      { selector: "[data-automation-id*='authorized'] input", key: "workAuth.authorizedToWork", confidence: 0.86 },
    ];
  },
  async fillExtras() {
    const quickApply = buttonByText(document, [/quick apply|autofill with resume|use my resume/i]);
    quickApply?.click();
  },
  findAdvance(dom) {
    return buttonByText(dom, [/^save and continue$/i, /^save & continue$/i]) ?? genericAdvance(dom);
  },
  findSubmit: genericSubmit,
  notes:
    "Targets Workday's stable data-automation-id attributes for legal name, contact, address, resume upload, and common work-authorization questions. Brittle areas: tenant-custom screening questions, dynamic repeaters, and listbox internals vary by Workday release.",
};
