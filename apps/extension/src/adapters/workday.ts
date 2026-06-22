import type { PlatformAdapter } from "../autofill/types";
import { fillWorkdayExperience } from "../autofill/workday-experience";
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
      dom.querySelector("[data-automation-id='progressBarActiveStep']")?.textContent ||
      dom.querySelector("[data-automation-id='progressTrackerActiveStep']")?.textContent ||
      dom.querySelector("[data-automation-id='stepName']")?.textContent ||
      dom.querySelector("h2[data-automation-id], h2, h1")?.textContent ||
      "Workday application";
    const items = Array.from(
      dom.querySelectorAll(
        "[data-automation-id='progressBarActiveStep'], [data-automation-id='progressBarCompletedStep'], [data-automation-id='progressBarInactiveStep'], [data-automation-id*='progressTracker']",
      ),
    );
    return { name: step.replace(/\s+/g, " ").trim(), total: items.length || undefined };
  },
  mapFields() {
    return [
      {
        selector:
          "[data-automation-id='legalNameSection_firstName'] input, [data-automation-id='firstName'] input, input[data-automation-id='legalNameSection_firstName'], input[data-automation-id='firstName'], input[autocomplete='given-name']",
        key: "identity.firstName",
      },
      {
        selector:
          "[data-automation-id='legalNameSection_lastName'] input, [data-automation-id='lastName'] input, input[data-automation-id='legalNameSection_lastName'], input[data-automation-id='lastName'], input[autocomplete='family-name']",
        key: "identity.lastName",
      },
      {
        selector:
          "[data-automation-id='preferredName'] input, [data-automation-id='preferredFirstName'] input, input[data-automation-id='preferredName'], input[data-automation-id='preferredFirstName']",
        key: "identity.preferredName",
      },
      {
        selector:
          "[data-automation-id='email'] input, [data-automation-id='emailAddress'] input, input[data-automation-id='email'], input[data-automation-id='emailAddress'], input[type='email'], input[autocomplete='email']",
        key: "identity.email",
      },
      {
        selector:
          "[data-automation-id='phone-number'] input, [data-automation-id='phoneNumber'] input, [data-automation-id='phoneWidget'] input, input[data-automation-id='phone-number'], input[data-automation-id='phoneNumber'], input[type='tel'], input[autocomplete='tel']",
        key: "identity.phone",
      },
      {
        selector:
          "[data-automation-id='addressLine1'] input, [data-automation-id='addressLine_1'] input, [data-automation-id='addressSection_addressLine1'] input, input[data-automation-id='addressLine1'], input[autocomplete='address-line1']",
        key: "location.street",
      },
      { selector: "[data-automation-id='city'] input, input[data-automation-id='city'], input[autocomplete='address-level2']", key: "location.city" },
      {
        selector:
          "[data-automation-id='state'] input, [data-automation-id='region'] input, input[data-automation-id='state'], input[data-automation-id='region'], input[autocomplete='address-level1']",
        key: "location.state",
      },
      {
        selector:
          "[data-automation-id='postalCode'] input, [data-automation-id='zipCode'] input, input[data-automation-id='postalCode'], input[data-automation-id='zipCode'], input[autocomplete='postal-code']",
        key: "location.postalCode",
      },
      {
        selector:
          "[data-automation-id='country'] input, [data-automation-id='country'] [role='combobox'], input[data-automation-id='country'], input[autocomplete='country-name']",
        key: "location.country",
      },
      {
        selector:
          "[data-automation-id='resumeUpload'] input[type='file'], [data-automation-id*='resume' i] input[type='file'], input[type='file'][data-automation-id*='resume' i], input[type='file'][name*='resume' i], input[type='file'][aria-label*='resume' i], input[type='file'][data-automation-id='file-upload-input-ref']",
        key: "documents.resume",
      },
      {
        selector:
          "[data-automation-id='coverLetterUpload'] input[type='file'], [data-automation-id*='cover' i] input[type='file'], input[type='file'][data-automation-id*='cover' i], input[type='file'][name*='cover' i], input[type='file'][aria-label*='cover' i]",
        key: "documents.coverLetter",
      },
      {
        selector:
          "[data-automation-id='linkedinQuestion'] input, [data-automation-id*='linkedin' i] input, input[data-automation-id*='linkedin' i], input[name*='linkedin' i]",
        key: "links.linkedin",
      },
      {
        selector:
          "[data-automation-id='websiteQuestion'] input, [data-automation-id*='portfolio' i] input, [data-automation-id*='website' i] input, input[name*='portfolio' i], input[name*='website' i]",
        key: "links.portfolio",
      },
      { selector: "[data-automation-id*='sponsorship' i] input, [data-automation-id*='visa' i] input", key: "workAuth.requiresSponsorship", confidence: 0.9 },
      { selector: "[data-automation-id*='authorized' i] input, [data-automation-id*='rightToWork' i] input", key: "workAuth.authorizedToWork", confidence: 0.86 },
    ];
  },
  async fillExtras(context) {
    const quickApply = buttonByText(document, [/quick apply|autofill with resume|use my resume/i]);
    quickApply?.click();
    await fillWorkdayExperience(context);
  },
  findAdvance(dom) {
    const footerNext = dom.querySelector<HTMLElement>("[data-automation-id='pageFooterNextButton']");
    if (footerNext) return footerNext;
    return buttonByText(dom, [/^save and continue$/i, /^save & continue$/i]) ?? genericAdvance(dom);
  },
  findSubmit: genericSubmit,
  notes:
    "Targets Workday's stable data-automation-id attributes for legal name, contact, address, resume upload, and common work-authorization questions. Brittle areas: tenant-custom screening questions, dynamic repeaters, and listbox internals vary by Workday release.",
};
