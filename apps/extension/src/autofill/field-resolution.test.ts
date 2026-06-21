import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import type { MasterProfile } from "@jobposted/shared";
import { detectAdapter } from "../adapters";
import { extractFields } from "./extract";
import { resolveField } from "./resolve";

const fixtures = import.meta.glob("../fixtures/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const profile: MasterProfile = {
  identity: {
    firstName: "Asha",
    lastName: "Raman",
    preferredName: "Asha",
    email: "asha@example.com",
    phone: "+1 555 0101",
  },
  location: { street: "1 Market St", city: "San Francisco", state: "CA", postalCode: "94105", country: "United States" },
  links: { portfolio: "https://asha.dev", linkedin: "https://linkedin.com/in/asha", github: "https://github.com/asha", website: [] },
  workAuth: { authorizedToWork: true, requiresSponsorship: false, country: "United States" },
  demographics: {},
  experience: [],
  education: [],
  skills: ["TypeScript", "React"],
  answers: [{ key: "why_company", prompt: "Why are you interested in this company?", value: "I am excited by the product and team." }],
  documents: { resumeUrl: "https://example.com/resume.pdf" },
};

async function loadFixture(name: string, url: string) {
  const html = fixtures[`../fixtures/${name}.html`];
  if (!html) throw new Error(`Missing fixture ${name}`);
  return loadHtml(html, url);
}

async function loadHtml(html: string, url: string) {
  const { document, window } = parseHTML(html);
  Object.assign(globalThis, {
    window,
    document,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLSelectElement: window.HTMLSelectElement,
    CSS: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") },
  });
  const adapter = detectAdapter(url, document);
  const fields = extractFields(document, adapter.id, adapter.mapFields(document));
  return { adapter, fields };
}

describe("field resolution", () => {
  it("maps Workday automation ids", async () => {
    const { adapter, fields } = await loadFixture("workday", "https://acme.myworkdayjobs.com/job/apply");
    expect(adapter.id).toBe("workday");
    const mappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "https://acme.myworkdayjobs.com/job/apply", demographicsEnabled: false })),
    );
    expect(mappings.map((mapping) => mapping.canonicalKey)).toContain("identity.firstName");
    expect(mappings.map((mapping) => mapping.canonicalKey)).toContain("identity.lastName");
    expect(mappings.map((mapping) => mapping.canonicalKey)).toContain("documents.resume");
  });

  it("maps Greenhouse core fields", async () => {
    const { adapter, fields } = await loadFixture("greenhouse", "https://boards.greenhouse.io/acme/jobs/1");
    expect(adapter.id).toBe("greenhouse");
    const labels = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(labels.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.firstName", "identity.lastName", "identity.email", "identity.phone", "documents.resume"]),
    );
  });

  it("maps Lever full name and links", async () => {
    const { adapter, fields } = await loadFixture("lever", "https://jobs.lever.co/acme/1");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.fullName", "identity.email", "links.linkedin", "documents.resume"]),
    );
  });

  it("maps Ashby named inputs", async () => {
    const { adapter, fields } = await loadFixture("ashby", "https://jobs.ashbyhq.com/acme/1");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.firstName", "identity.lastName", "identity.email", "identity.phone", "documents.resume"]),
    );
  });

  it("extracts Ashby <button> Yes/No groups and a url LinkedIn field", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form>
        <div class="_fieldEntry">
          <label class="_label">LinkedIn<span aria-hidden="true">*</span></label>
          <div class="_inputWrap"><input type="url" name="4a5a4b65-b85e-4a0c-8edc-91a4ed39c2d2" placeholder="https://example.com..." /></div>
        </div>
        <div class="_fieldEntry">
          <div class="_label">Will you now or in the future require sponsorship to work in the US?<span aria-hidden="true">*</span></div>
          <div class="_options">
            <button type="button">Yes</button>
            <button type="button">No</button>
          </div>
        </div>
      </form>`,
      "https://jobs.ashbyhq.com/acme/abc/application",
    );
    expect(adapter.id).toBe("ashby");
    const mappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })),
    );
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));

    const linkedinField = fields.find((field) => /linkedin/i.test(field.label));
    expect(linkedinField).toBeTruthy();
    expect(byLabel.get(linkedinField!.label)?.canonicalKey).toBe("links.linkedin");

    const sponsorField = fields.find((field) => /sponsorship/i.test(field.label));
    expect(sponsorField?.type).toBe("radio");
    expect(sponsorField?.options).toEqual(["Yes", "No"]);
    expect(byLabel.get(sponsorField!.label)?.canonicalKey).toBe("workAuth.requiresSponsorship");
  });

  it("maps newer Greenhouse board field variants", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form>
        <div><span data-testid="field-label">First name</span><input autocomplete="given-name" /></div>
        <div><span data-testid="field-label">Last name</span><input autocomplete="family-name" /></div>
        <div><span data-testid="field-label">Email</span><input name="email" type="email" /></div>
        <div><span data-testid="field-label">Phone</span><input autocomplete="tel" /></div>
        <div><span data-testid="field-label">Resume/CV</span><input id="resume-attachment" type="file" /></div>
      </form>`,
      "https://job-boards.greenhouse.io/acme/jobs/1",
    );
    expect(adapter.id).toBe("greenhouse");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.firstName", "identity.lastName", "identity.email", "identity.phone", "documents.resume"]),
    );
  });

  it("maps Databricks embedded Greenhouse visual-label fields", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form>
        <section>
          <div class="field"><div class="field-heading">First Name <span aria-hidden="true">*</span></div><input /></div>
          <div class="field"><div class="field-heading">Last Name <span aria-hidden="true">*</span></div><input /></div>
          <div class="field"><div class="field-heading">Preferred First Name <span aria-hidden="true">*</span></div><input /></div>
          <div class="field"><div class="field-heading">Email <span aria-hidden="true">*</span></div><input /></div>
          <div class="row">
            <div class="field"><div class="field-heading">Country <span aria-hidden="true">*</span></div><select><option>United States</option></select></div>
            <div class="field"><div class="field-heading">Phone <span aria-hidden="true">*</span></div><input /></div>
          </div>
          <div class="field"><div class="field-heading">Resume/CV <span aria-hidden="true">*</span></div><input type="file" /></div>
        </section>
      </form>`,
      "https://www.databricks.com/company/careers/engineering/sr-engineering-manager---notebook-dataplane-8305835325",
    );
    expect(adapter.id).toBe("generic");
    expect(fields.filter((field) => field.required).map((field) => field.label)).toEqual(
      expect.arrayContaining(["First Name *", "Preferred First Name *", "Resume/CV *"]),
    );

    const profileWithoutPreferredName: MasterProfile = {
      ...profile,
      identity: { ...profile.identity, preferredName: null },
    };
    const mappings = await Promise.all(
      fields.map((field) =>
        resolveField({
          field,
          profile: profileWithoutPreferredName,
          platform: adapter.id,
          url: "",
          demographicsEnabled: false,
        }),
      ),
    );
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));

    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining([
        "identity.firstName",
        "identity.lastName",
        "identity.preferredName",
        "identity.email",
        "identity.phone",
        "identity.phoneCountryCode",
        "documents.resume",
      ]),
    );
    expect(byLabel.get("Preferred First Name *")?.value).toBe(profile.identity.firstName);
  });

  it("maps Databricks required custom dropdown questions", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form>
        <div class="field">
          <div class="field-heading">Are you legally authorized to work in the country in which you are applying?<span aria-hidden="true">*</span></div>
          <button aria-haspopup="listbox" aria-label="Select..." aria-controls="auth-options">Select...</button>
          <ul id="auth-options" role="listbox"><li role="option">Yes</li><li role="option">No</li></ul>
        </div>
        <div class="field">
          <div class="field-heading">Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying?<span aria-hidden="true">*</span></div>
          <button aria-haspopup="listbox" aria-label="Select..." aria-controls="sponsor-options">Select...</button>
          <ul id="sponsor-options" role="listbox"><li role="option">Yes</li><li role="option">No</li></ul>
        </div>
      </form>`,
      "https://www.databricks.com/company/careers/engineering/sr-engineering-manager---notebook-dataplane-8305835325",
    );
    expect(adapter.id).toBe("generic");
    const mappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })),
    );
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));

    expect(byLabel.get("Are you legally authorized to work in the country in which you are applying?*")?.canonicalKey).toBe("workAuth.authorizedToWork");
    expect(byLabel.get("Are you legally authorized to work in the country in which you are applying?*")?.value).toBe(true);
    expect(byLabel.get("Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying?*")?.canonicalKey).toBe(
      "workAuth.requiresSponsorship",
    );
    expect(byLabel.get("Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying?*")?.value).toBe(false);
  });

  it("falls back to setup work-auth answers when direct work-auth fields are missing", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form>
        <div class="field">
          <div class="field-heading">Are you legally authorized to work in the country in which you are applying?<span aria-hidden="true">*</span></div>
          <button aria-haspopup="listbox" aria-label="Select..." aria-controls="auth-options">Select...</button>
          <ul id="auth-options" role="listbox"><li role="option">Yes</li><li role="option">No</li></ul>
        </div>
        <div class="field">
          <div class="field-heading">Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying?<span aria-hidden="true">*</span></div>
          <button aria-haspopup="listbox" aria-label="Select..." aria-controls="sponsor-options">Select...</button>
          <ul id="sponsor-options" role="listbox"><li role="option">Yes</li><li role="option">No</li></ul>
        </div>
      </form>`,
      "https://www.databricks.com/company/careers/engineering/sr-engineering-manager---notebook-dataplane-8305835325",
    );
    const fallbackProfile: MasterProfile = {
      ...profile,
      workAuth: { authorizedToWork: null, requiresSponsorship: null, country: "United States" },
      answers: [
        { key: "workAuth.authorized_to_work", prompt: "Are you legally authorized to work in your resident country?", value: "Yes" },
        { key: "workAuth.needs_sponsorship", prompt: "Will you now or in the future require visa sponsorship?", value: "No" },
      ],
    };
    const mappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile: fallbackProfile, platform: adapter.id, url: "", demographicsEnabled: false })),
    );
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));

    expect(byLabel.get("Are you legally authorized to work in the country in which you are applying?*")).toMatchObject({
      canonicalKey: "workAuth.authorizedToWork",
      value: true,
      source: "answer",
    });
    expect(byLabel.get("Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying?*")).toMatchObject({
      canonicalKey: "workAuth.requiresSponsorship",
      value: false,
      source: "answer",
    });
  });

  it("maps neutral export-control checkboxes to checked answers", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form>
        <fieldset>
          <legend>Please confirm whether any of the below applies to you. This information will only be used to ensure compliance with U.S. sanctions and export controls.<span aria-hidden="true">*</span></legend>
          <label><input type="checkbox" /> Citizen or permanent resident of Cuba, Iran, North Korea, or Syria</label>
          <label><input type="checkbox" /> Ordinarily a resident of Russia or Belarus and not willing to relocate</label>
          <label><input type="checkbox" /> None of the above</label>
        </fieldset>
        <fieldset>
          <legend>If you selected a response to the prior question other than none of the above, please confirm whether any of the following also applies to you.<span aria-hidden="true">*</span></legend>
          <label><input type="checkbox" /> U.S. citizen</label>
          <label><input type="checkbox" /> None of these apply to me</label>
          <label><input type="checkbox" /> Not applicable (i.e., I selected none of the above for the prior question)</label>
        </fieldset>
      </form>`,
      "https://www.databricks.com/company/careers/executive-engineering---pipeline/engineering-manager---backend-7439442002",
    );
    const mappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })),
    );
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));

    expect(byLabel.get("None of the above")?.canonicalKey).toBe("answers.screening.compliance_none_of_above");
    expect(byLabel.get("None of the above")?.value).toBe(true);
    expect(byLabel.get("Not applicable (i.e., I selected none of the above for the prior question)")?.canonicalKey).toBe(
      "answers.screening.compliance_none_of_above",
    );
    expect(byLabel.get("Not applicable (i.e., I selected none of the above for the prior question)")?.value).toBe(true);
  });

  it("maps current-firm questions to the current organization from experience", async () => {
    const { document } = parseHTML("<input />");
    const mapping = await resolveField({
      field: {
        id: "current-firm",
        element: document.querySelector("input") as HTMLElement,
        label: "Current firm you're part of?",
        context: "",
        type: "text",
        required: true,
        options: [],
        signature: "current-firm",
      },
      profile: {
        ...profile,
        experience: [
          { title: "Senior Engineer", company: "Older Co", startDate: "2021-01", endDate: "2023-12", current: false, bullets: [] },
          { title: "Staff Engineer", company: "Orbit Labs", startDate: "2024-01", endDate: null, current: true, bullets: [] },
        ],
      },
      platform: "generic",
      url: "",
      demographicsEnabled: false,
    });

    expect(mapping.canonicalKey).toBe("experience.currentCompany");
    expect(mapping.value).toBe("Orbit Labs");
  });

  it("treats a country control beside phone as a phone calling-code field even before options render", async () => {
    const { document } = parseHTML(`
      <div class="row">
        <div class="field">
          <div class="field-heading">Country<span aria-hidden="true">*</span></div>
          <button aria-haspopup="listbox" aria-label="Select...">Select...</button>
        </div>
        <div class="field">
          <div class="field-heading">Phone<span aria-hidden="true">*</span></div>
          <input type="tel" />
        </div>
      </div>
    `);
    const country = document.querySelector("button") as HTMLElement;
    const mapping = await resolveField({
      field: {
        id: "phone-country",
        element: country,
        label: "Country*",
        context: "",
        type: "combobox",
        required: true,
        options: [],
        signature: "phone-country",
      },
      profile,
      platform: "generic",
      url: "",
      demographicsEnabled: false,
    });

    expect(mapping.canonicalKey).toBe("identity.phoneCountryCode");
    expect(mapping.value).toBe("+1");
  });

  it("marks Greenhouse visual stars without a preceding space as required", async () => {
    const { fields } = await loadHtml(
      `<!doctype html>
      <form>
        <div class="field">
          <div class="field-heading">Are you legally authorized to work in the country in which you are applying?<span aria-hidden="true">*</span></div>
          <button aria-haspopup="listbox" aria-label="Select..." aria-controls="auth-options">Select...</button>
          <ul id="auth-options" role="listbox"><li role="option">Yes</li><li role="option">No</li></ul>
        </div>
      </form>`,
      "https://www.databricks.com/company/careers/engineering/sr-engineering-manager---notebook-dataplane-8305835325",
    );

    expect(fields[0]?.required).toBe(true);
  });

  it("does not extract searchable dropdown internals as separate fields", async () => {
    const { fields } = await loadHtml(
      `<!doctype html>
      <form>
        <div class="field">
          <div class="field-heading">Country<span aria-hidden="true">*</span></div>
          <button role="combobox" aria-controls="phone-country-options">Select...</button>
          <div id="phone-country-options" role="listbox">
            <input role="textbox" value="" />
            <div role="option">India +91</div>
          </div>
        </div>
        <div class="field"><div class="field-heading">Phone<span aria-hidden="true">*</span></div><input type="tel" /></div>
      </form>`,
      "https://www.databricks.com/company/careers/engineering/sr-engineering-manager---notebook-dataplane-8305835325",
    );

    expect(fields.map((field) => field.label)).toEqual(["Country*", "Phone*"]);
  });

  it("uses the source fallback when a saved referral answer only repeats the question prompt", async () => {
    const { document } = parseHTML("<input />");
    const prompt = "How did you hear about this job?";
    const mapping = await resolveField({
      field: {
        id: "referral-source",
        element: document.querySelector("input") as HTMLElement,
        label: prompt,
        context: "",
        type: "text",
        required: true,
        options: [],
        signature: "referral-source",
      },
      profile: {
        ...profile,
        answers: [{ key: "referral_source", prompt, value: prompt }],
      },
      platform: "generic",
      url: "",
      demographicsEnabled: false,
    });

    expect(mapping).toMatchObject({
      canonicalKey: "answers.referral_source",
      value: "LinkedIn",
      source: "heuristic",
    });
  });

  it("maps Lever and Ashby single-name variants", async () => {
    const lever = await loadHtml(
      `<!doctype html>
      <form>
        <label>Name <input autocomplete="name" /></label>
        <label>Email <input autocomplete="email" /></label>
        <label>Phone <input autocomplete="tel" /></label>
        <label>Resume <input id="resume-upload" type="file" /></label>
      </form>`,
      "https://jobs.lever.co/acme/1",
    );
    const ashby = await loadHtml(
      `<!doctype html>
      <form data-testid="CandidateApplicationForm">
        <label>Name <input name="_systemfield_name" /></label>
        <label>Email <input name="_systemfield_email" /></label>
        <label>Phone <input name="_systemfield_phone" /></label>
        <div data-testid="resume-upload"><label>Resume</label><input type="file" /></div>
      </form>`,
      "https://jobs.ashbyhq.com/acme/1/application",
    );
    const leverMappings = await Promise.all(
      lever.fields.map((field) => resolveField({ field, profile, platform: lever.adapter.id, url: "", demographicsEnabled: false })),
    );
    const ashbyMappings = await Promise.all(
      ashby.fields.map((field) => resolveField({ field, profile, platform: ashby.adapter.id, url: "", demographicsEnabled: false })),
    );

    expect(leverMappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.fullName", "identity.email", "identity.phone", "documents.resume"]),
    );
    expect(ashbyMappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.fullName", "identity.email", "identity.phone", "documents.resume"]),
    );
  });

  it("maps Workday modern automation ids and file upload input", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form data-automation-id="workdayApplication">
        <div data-automation-id="firstName"><div data-automation-id="textInputLabel">First Name</div><input /></div>
        <div data-automation-id="lastName"><div data-automation-id="textInputLabel">Last Name</div><input /></div>
        <div data-automation-id="emailAddress"><div data-automation-id="textInputLabel">Email</div><input type="email" /></div>
        <div data-automation-id="phoneNumber"><div data-automation-id="textInputLabel">Phone</div><input type="tel" /></div>
        <div data-automation-id="resumeUpload"><div data-automation-id="fieldLabel">Resume/CV</div><input data-automation-id="file-upload-input-ref" type="file" /></div>
      </form>`,
      "https://acme.wd5.myworkdayjobs.com/jobs/job/1",
    );
    expect(adapter.id).toBe("workday");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.firstName", "identity.lastName", "identity.email", "identity.phone", "documents.resume"]),
    );
  });

  it("uses generic heuristics and reusable answers", async () => {
    const { adapter, fields } = await loadFixture("generic", "https://careers.example.com/apply");
    expect(adapter.id).toBe("generic");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.firstName", "identity.lastName", "identity.email", "workAuth.requiresSponsorship", "answers.why_company"]),
    );
  });

  it("maps company employee connection questions to the setup answer", async () => {
    const { document } = parseHTML("<input />");
    const mapping = await resolveField({
      field: {
        id: "company-connection",
        element: document.querySelector("input") as HTMLElement,
        label: "Do you have any relatives currently employed by this organization?",
        context: "",
        type: "radio",
        required: true,
        options: ["Yes", "No"],
        signature: "company-connection",
      },
      profile: {
        ...profile,
        answers: [
          { key: "screening.company_employee_connection", prompt: "Do you know anyone at this company?", value: "No" },
        ],
      },
      platform: "generic",
      url: "",
      demographicsEnabled: false,
    });

    expect(mapping.source).toBe("answer");
    expect(mapping.canonicalKey).toBe("answers.screening.company_employee_connection");
    expect(mapping.value).toBe("No");
  });

  it("defaults company-specific previous employment to No unless work experience matches the company", async () => {
    const { document } = parseHTML("<button />");
    const baseField = {
      id: "databricks-past",
      element: document.querySelector("button") as HTMLElement,
      label: "Do you currently or have you previously worked for Databricks in the past?",
      context: "",
      type: "combobox" as const,
      required: true,
      options: ["Yes", "No"],
      signature: "databricks-past",
    };
    const noMatch = await resolveField({
      field: baseField,
      profile: {
        ...profile,
        experience: [{ title: "Engineer", company: "ION Group", startDate: "2022-01", endDate: null, current: true, bullets: [] }],
        answers: [],
      },
      platform: "generic",
      url: "",
      demographicsEnabled: false,
    });
    const matched = await resolveField({
      field: baseField,
      profile: {
        ...profile,
        experience: [{ title: "Engineer", company: "data bricks", startDate: "2022-01", endDate: "2023-01", current: false, bullets: [] }],
        answers: [],
      },
      platform: "generic",
      url: "",
      demographicsEnabled: false,
    });

    expect(noMatch.canonicalKey).toBe("answers.screening.previous_company_employment");
    expect(noMatch.value).toBe("No");
    expect(matched.canonicalKey).toBe("answers.screening.previous_company_employment");
    expect(matched.value).toBe("Yes");
  });

  it("maps previous employment and outside business activity questions to setup answers", async () => {
    const { document } = parseHTML("<input />");
    const baseField = {
      id: "custom-question",
      element: document.querySelector("input") as HTMLElement,
      context: "",
      type: "radio" as const,
      required: true,
      options: ["Yes", "No"],
      signature: "custom-question",
    };
    const testProfile = {
      ...profile,
      answers: [
        { key: "screening.previous_company_employment", prompt: "Have you been employed by this company in the past?", value: "No" },
        { key: "screening.outside_business_activities", prompt: "Do you have any outside business activities you would continue if hired?", value: "No" },
      ],
    };
    const previous = await resolveField({
      field: {
        ...baseField,
        label: "Have you been employed by Okta, Inc. or any of its subsidiaries in the past?",
      },
      profile: testProfile,
      platform: "generic",
      url: "",
      demographicsEnabled: false,
    });
    const outside = await resolveField({
      field: {
        ...baseField,
        id: "outside-business",
        signature: "outside-business",
        label: "Do you have any outside business activity(ies) that you would continue engaging in if you joined us?",
      },
      profile: testProfile,
      platform: "generic",
      url: "",
      demographicsEnabled: false,
    });

    expect(previous.canonicalKey).toBe("answers.screening.previous_company_employment");
    expect(previous.value).toBe("No");
    expect(outside.canonicalKey).toBe("answers.screening.outside_business_activities");
    expect(outside.value).toBe("No");
  });
});
