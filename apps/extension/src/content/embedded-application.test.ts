import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import {
  hasEmbeddedApplicationFrame,
  isApplicationHostUrl,
  shouldDeferToEmbeddedApplication,
} from "./embedded-application";

function doc(html: string) {
  return parseHTML(html).document;
}

describe("embedded application frame detection", () => {
  it("does not defer a direct Greenhouse application page because helper iframe query params mention greenhouse", () => {
    const document = doc(`
      <form id="application_form"><input id="first_name" aria-label="First Name" /></form>
      <iframe src="https://www.recaptcha.net/recaptcha/enterprise/anchor?co=aHR0cHM6Ly9qb2ItYm9hcmRzLmdyZWVuaG91c2UuaW86NDQz"></iframe>
      <iframe src="https://content.googleapis.com/static/proxy.html#parent=https%3A%2F%2Fjob-boards.greenhouse.io"></iframe>
    `);

    expect(hasEmbeddedApplicationFrame(document, "https://job-boards.greenhouse.io/embed/job_app?token=1")).toBe(false);
    expect(shouldDeferToEmbeddedApplication(document, "https://job-boards.greenhouse.io/embed/job_app?token=1", true)).toBe(false);
  });

  it("defers an external wrapper page that embeds a supported ATS application iframe", () => {
    const document = doc(`
      <main><h1>Careers</h1></main>
      <iframe src="https://job-boards.greenhouse.io/embed/job_app?token=1"></iframe>
    `);

    expect(hasEmbeddedApplicationFrame(document, "https://company.example/jobs/apply")).toBe(true);
    expect(shouldDeferToEmbeddedApplication(document, "https://company.example/jobs/apply", true)).toBe(true);
  });

  it("defers public company career pages that embed a Greenhouse job application frame", () => {
    const document = doc(`
      <main><h1>Engineering Manager</h1></main>
      <iframe
        id="grnhse_iframe"
        src="https://job-boards.greenhouse.io/embed/job_app?for=databricks&token=7439442002"
      ></iframe>
    `);

    expect(hasEmbeddedApplicationFrame(document, "https://www.databricks.com/company/careers/role?gh_jid=7439442002")).toBe(
      true,
    );
    expect(
      shouldDeferToEmbeddedApplication(
        document,
        "https://www.databricks.com/company/careers/role?gh_jid=7439442002",
        true,
      ),
    ).toBe(true);
  });

  it("matches supported ATS hosts by hostname, not arbitrary URL text", () => {
    expect(isApplicationHostUrl("https://jobs.lever.co/example/123")).toBe(true);
    expect(isApplicationHostUrl("https://www.recaptcha.net/?next=https%3A%2F%2Fjobs.lever.co%2Fexample")).toBe(false);
  });
});
