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

  it("maps Lever full name and links", async () => {
    const { adapter, fields } = await loadFixture("lever", "https://jobs.lever.co/acme/1");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.fullName", "identity.email", "links.linkedin", "documents.resume"]),
    );
  });

  it("maps Lever pronoun checkboxes from setup gender", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form class="application">
        <li class="application-question">
          <div class="application-label multiple-select">Pronouns</div>
          <div class="application-field">
            <ul data-qa="candidatePronounsCheckboxes" id="candidatePronounsCheckboxes">
              <li><label><input type="checkbox" name="pronouns" value="He/him" /><span>He/him</span></label></li>
              <li><label><input type="checkbox" name="pronouns" value="She/her" /><span>She/her</span></label></li>
              <li><label><input type="checkbox" name="pronouns" value="They/them" /><span>They/them</span></label></li>
              <li><label><input type="checkbox" name="pronouns" value="Use name only" /><span>Use name only</span></label></li>
            </ul>
          </div>
        </li>
      </form>`,
      "https://jobs.lever.co/dnb/8eb0cdd5-1bf4-4865-9e84-7db8ec89fba2/apply",
    );
    const maleProfile: MasterProfile = { ...profile, demographics: { gender: "Male" } };
    const femaleProfile: MasterProfile = { ...profile, demographics: { gender: "Female" } };
    const maleMappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile: maleProfile, platform: adapter.id, url: "", demographicsEnabled: false })),
    );
    const femaleMappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile: femaleProfile, platform: adapter.id, url: "", demographicsEnabled: false })),
    );
    const maleByLabel = new Map(fields.map((field, index) => [field.label, maleMappings[index]]));
    const femaleByLabel = new Map(fields.map((field, index) => [field.label, femaleMappings[index]]));

    expect(adapter.id).toBe("lever");
    expect(fields.find((field) => field.label === "He/him")?.type).toBe("checkbox");
    expect(maleByLabel.get("He/him")).toMatchObject({
      canonicalKey: "answers.profile_pronouns",
      value: "He/him",
    });
    expect(femaleByLabel.get("She/her")).toMatchObject({
      canonicalKey: "answers.profile_pronouns",
      value: "She/her",
    });
  });

  it("extracts Lever application cards with hidden native radio groups", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form class="application">
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Full name<span class="required">*</span></div></div>
          <div class="application-field full-width required-field"><input name="name" required /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Email<span class="required">*</span></div></div>
          <div class="application-field full-width required-field"><input name="email" type="email" required /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Phone <span class="required">*</span></div></div>
          <div class="application-field full-width required-field"><input name="phone" required /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">LinkedIn URL</div></div>
          <div class="application-field full-width"><input name="urls[LinkedIn]" /></div>
        </li>
        <li class="application-question custom-question">
          <div class="application-label full-width multiple-choice">
            <div class="text">Are you a current or previous employee of Dun &amp; Bradstreet?<span class="required">*</span></div>
          </div>
          <div class="application-field full-width required-field">
            <ul data-qa="multiple-choice">
              <li><label><input type="radio" name="cards[dnb][field0]" value="No previous work experience with the company" required style="display:none" /><span>No previous work experience with the company</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field0]" value="Former employee or intern" required style="display:none" /><span>Former employee or intern</span></label></li>
            </ul>
          </div>
        </li>
        <li class="application-question custom-question">
          <div class="application-label full-width multiple-choice">
            <div class="text">Do you have a family member or relative who is currently employed by Dun &amp; Bradstreet?<span class="required">*</span></div>
          </div>
          <div class="application-field full-width required-field">
            <ul data-qa="multiple-choice">
              <li><label><input type="radio" name="cards[dnb][field1]" value="Yes" required style="display:none" /><span>Yes</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field1]" value="No" required style="display:none" /><span>No</span></label></li>
            </ul>
          </div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Resume/CV <span class="required">*</span></div></div>
          <div class="application-field full-width required-field"><input type="file" name="resume" /></div>
        </li>
      </form>`,
      "https://jobs.lever.co/dnb/8eb0cdd5-1bf4-4865-9e84-7db8ec89fba2/apply",
    );
    expect(adapter.id).toBe("lever");
    expect(fields.map((field) => field.label)).toEqual(
      expect.arrayContaining(["Full name*", "Email*", "Phone *", "LinkedIn URL", "Resume/CV *"]),
    );
    const radioFields = fields.filter((field) => field.type === "radio");
    expect(radioFields).toHaveLength(2);
    expect(radioFields[0]).toMatchObject({
      label: "Are you a current or previous employee of Dun & Bradstreet?*",
      required: true,
      options: ["No previous work experience with the company", "Former employee or intern"],
    });
    expect(radioFields[1]).toMatchObject({
      label: "Do you have a family member or relative who is currently employed by Dun & Bradstreet?*",
      required: true,
      options: ["Yes", "No"],
    });
  });

  it("answers D&B Lever background radios with safe negative defaults", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form class="application">
        <li class="application-question custom-question">
          <div class="application-label full-width multiple-choice">
            <div class="text">Are you a current or previous employee of Dun &amp; Bradstreet?<span class="required">*</span></div>
          </div>
          <div class="application-field full-width required-field">
            <ul data-qa="multiple-choice">
              <li><label><input type="radio" name="cards[dnb][field0]" value="No previous work experience with the company" required /><span>No previous work experience with the company</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field0]" value="Former employee or intern" required /><span>Former employee or intern</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field0]" value="Former contractor" required /><span>Former contractor</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field0]" value="Current employee or intern" required /><span>Current employee or intern</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field0]" value="Current contractor" required /><span>Current contractor</span></label></li>
            </ul>
          </div>
        </li>
        <li class="application-question custom-question">
          <div class="application-label full-width multiple-choice">
            <div class="text">Do you have a family member or relative who is currently employed by Dun &amp; Bradstreet?<span class="required">*</span></div>
          </div>
          <div class="application-field full-width required-field">
            <ul data-qa="multiple-choice">
              <li><label><input type="radio" name="cards[dnb][field1]" value="Yes" required /><span>Yes</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field1]" value="No" required /><span>No</span></label></li>
            </ul>
          </div>
        </li>
        <li class="application-question custom-question">
          <div class="application-label full-width text"><div class="text">If you have a family member or relative currently employed by Dun &amp; Bradstreet, please list their name(s):</div></div>
          <div class="application-field full-width"><input class="card-field-input" type="text" name="cards[dnb][field2]" /></div>
        </li>
        <li class="application-question custom-question">
          <div class="application-label full-width multiple-choice">
            <div class="text">Did a current Dun &amp; Bradstreet employee influence you to apply or refer you to the company/role?<span class="required">*</span></div>
          </div>
          <div class="application-field full-width required-field">
            <ul data-qa="multiple-choice">
              <li><label><input type="radio" name="cards[dnb][field3]" value="Yes" required /><span>Yes</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field3]" value="No" required /><span>No</span></label></li>
            </ul>
          </div>
        </li>
        <li class="application-question custom-question">
          <div class="application-label full-width text"><div class="text">If you were referred by a Dun &amp; Bradstreet employee, please list their name:</div></div>
          <div class="application-field full-width"><input class="card-field-input" type="text" name="cards[dnb][field4]" /></div>
        </li>
      </form>`,
      "https://jobs.lever.co/dnb/8eb0cdd5-1bf4-4865-9e84-7db8ec89fba2/apply",
    );
    expect(adapter.id).toBe("lever");
    const profileWithGenericConnectionYes: MasterProfile = {
      ...profile,
      answers: [
        ...profile.answers,
        { key: "screening.company_employee_connection", prompt: "Do you know anyone at this company?", value: "Yes" },
      ],
    };
    const mappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile: profileWithGenericConnectionYes, platform: adapter.id, url: "", demographicsEnabled: false })),
    );
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));

    expect(byLabel.get("Are you a current or previous employee of Dun & Bradstreet?*")).toMatchObject({
      canonicalKey: "answers.screening.previous_company_employment",
      value: "No",
    });
    expect(byLabel.get("Do you have a family member or relative who is currently employed by Dun & Bradstreet?*")).toMatchObject({
      canonicalKey: "answers.screening.company_relative_connection",
      value: "No",
      source: "heuristic",
    });
    expect(byLabel.get("Did a current Dun & Bradstreet employee influence you to apply or refer you to the company/role?*")).toMatchObject({
      canonicalKey: "answers.screening.company_employee_connection",
      value: "No",
      source: "heuristic",
    });
    expect(byLabel.get("If you have a family member or relative currently employed by Dun & Bradstreet, please list their name(s):")?.canonicalKey).toBe("unknown");
    expect(byLabel.get("If you were referred by a Dun & Bradstreet employee, please list their name:")?.canonicalKey).toBe("unknown");
  });

  it("falls back to Lever form controls when visibility checks report no fields", async () => {
    const { document, window } = parseHTML(
      `<!doctype html>
      <form class="application">
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Full name<span class="required">*</span></div></div>
          <div class="application-field full-width required-field"><input name="name" required /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Email<span class="required">*</span></div></div>
          <div class="application-field full-width required-field"><input name="email" type="email" required /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Phone <span class="required">*</span></div></div>
          <div class="application-field full-width required-field"><input name="phone" required /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Resume/CV <span class="required">*</span></div></div>
          <div class="application-field full-width required-field"><input type="file" name="resume" /></div>
        </li>
      </form>`,
    );
    Object.defineProperty(window, "getComputedStyle", {
      configurable: true,
      value: () => ({ display: "block", visibility: "visible" }),
    });
    Object.assign(globalThis, {
      window,
      document,
      HTMLElement: window.HTMLElement,
      HTMLInputElement: window.HTMLInputElement,
      HTMLTextAreaElement: window.HTMLTextAreaElement,
      HTMLSelectElement: window.HTMLSelectElement,
      CSS: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") },
    });

    const adapter = detectAdapter("https://jobs.lever.co/dnb/8eb0cdd5-1bf4-4865-9e84-7db8ec89fba2/apply", document);
    const fields = extractFields(document, adapter.id, adapter.mapFields(document));

    expect(adapter.id).toBe("lever");
    expect(fields.map((field) => field.label)).toEqual(
      expect.arrayContaining(["Full name*", "Email*", "Phone *", "Resume/CV *"]),
    );
  });

  it("maps Ashby named inputs", async () => {
    const { adapter, fields } = await loadFixture("ashby", "https://jobs.ashbyhq.com/acme/1");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.firstName", "identity.lastName", "identity.email", "identity.phone", "documents.resume"]),
    );
  });

  it("maps Ashby current-or-last company questions to the latest employer", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form data-testid="CandidateApplicationForm">
        <div class="_fieldEntry">
          <label class="_label" for="current-company">Current or last company you worked for</label>
          <div class="_inputWrap"><input id="current-company" placeholder="Type here..." /></div>
        </div>
      </form>`,
      "https://jobs.ashbyhq.com/hopper/0c3887e0-ea7f-40a7-aad2-0c69882a5068/application",
    );
    const profileWithExperience: MasterProfile = {
      ...profile,
      experience: [
        { title: "Senior Engineer", company: "Older Co", startDate: "2021-01", endDate: "2023-12", current: false, bullets: [] },
        { title: "Staff Engineer", company: "Orbit Labs", startDate: "2024-01", endDate: null, current: true, bullets: [] },
      ],
    };
    const mappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile: profileWithExperience, platform: adapter.id, url: "", demographicsEnabled: false })),
    );
    const company = fields.find((field) => /current or last company/i.test(field.label));
    const mapping = company ? mappings[fields.indexOf(company)] : null;

    expect(adapter.id).toBe("ashby");
    expect(company).toBeTruthy();
    expect(mapping).toMatchObject({
      canonicalKey: "experience.currentCompany",
      value: "Orbit Labs",
    });
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

  it("uses Greenhouse upload labels for visually hidden resume file inputs", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form>
        <div class="file-upload">
          <div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div>
          <button type="button">Attach</button>
          <label class="visually-hidden" for="resume">Attach</label>
          <input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" />
          <button type="button">Enter manually</button>
        </div>
      </form>`,
      "https://job-boards.greenhouse.io/acme/jobs/123",
    );
    expect(adapter.id).toBe("generic");
    const resume = fields.find((field) => field.type === "file");
    expect(resume).toBeTruthy();
    expect(resume!.label).toMatch(/Resume\/CV/);
    expect(resume!.label).not.toBe("Attach");

    const mapping = await resolveField({ field: resume!, profile, platform: adapter.id, url: "", demographicsEnabled: false });
    expect(mapping.canonicalKey).toBe("documents.resume");
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

  it("infers setup work authorization from non-exact sponsorship answers", async () => {
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
        { key: "screening.visa_sponsorship", prompt: "Will you now or in the future require visa sponsorship?", value: "No" },
      ],
    };
    const mappings = await Promise.all(
      fields.map((field) => resolveField({ field, profile: fallbackProfile, platform: adapter.id, url: "", demographicsEnabled: false })),
    );
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));

    expect(byLabel.get("Are you legally authorized to work in the country in which you are applying?*")).toMatchObject({
      canonicalKey: "workAuth.authorizedToWork",
      value: true,
      source: "heuristic",
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

  it("treats country dropdowns with calling-code options as phone country-code fields", async () => {
    const { document } = parseHTML(`
      <div class="field">
        <div class="field-heading">Country<span aria-hidden="true">*</span></div>
        <button aria-haspopup="listbox" aria-controls="country-options">Select...</button>
        <ul id="country-options" role="listbox">
          <li role="option">United States +1</li>
          <li role="option">India +91</li>
        </ul>
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
        options: ["United States +1", "India +91"],
        signature: "phone-country",
      },
      profile: {
        ...profile,
        identity: { ...profile.identity, phone: "+91 73300 07006" },
        location: { ...profile.location, country: "India" },
        workAuth: { ...profile.workAuth, country: "India" },
      },
      platform: "generic",
      url: "",
      demographicsEnabled: false,
    });

    expect(mapping.canonicalKey).toBe("identity.phoneCountryCode");
    expect(mapping.value).toBe("+91");
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

  it("maps hidden Workday drop-zone file inputs to resume upload", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form data-automation-id="workdayApplication">
        <div data-automation-id="resumeUpload">
          <div data-automation-id="fieldLabel">Resume/CV</div>
          <button type="button">Select files</button>
          <input data-automation-id="file-upload-input-ref" type="file" style="display:none" />
        </div>
      </form>`,
      "https://acme.wd5.myworkdayjobs.com/jobs/job/1",
    );
    expect(adapter.id).toBe("workday");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toContain("documents.resume");
  });

  it("maps Workday legal-name labels from the field label and skips local-name fields", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form data-automation-id="workdayApplication">
        <section>
          <h3>Name</h3>
          <div data-automation-id="formField-givenName"><label for="given">Given Name(s)<span>*</span></label><input id="given" /></div>
          <div data-automation-id="formField-familyName"><label for="family">Family Name</label><input id="family" /></div>
          <div data-automation-id="formField-localGivenName"><label for="local-given">Local Given Name(s)</label><input id="local-given" /></div>
          <div data-automation-id="formField-localFamilyName"><label for="local-family">Local Family Name</label><input id="local-family" /></div>
        </section>
      </form>`,
      "https://factset.wd108.myworkdayjobs.com/jobs/apply",
    );
    expect(adapter.id).toBe("workday");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));

    expect(byLabel.get("Given Name(s)*")).toMatchObject({ canonicalKey: "identity.firstName", value: "Asha" });
    expect(byLabel.get("Family Name")).toMatchObject({ canonicalKey: "identity.lastName", value: "Raman" });
    expect(byLabel.get("Local Given Name(s)")?.canonicalKey).toBe("unknown");
    expect(byLabel.get("Local Family Name")?.canonicalKey).toBe("unknown");
  });

  it("skips Workday phone extension and keeps phone number on the phone-number field", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form data-automation-id="workdayApplication">
        <section data-automation-id="phoneWidget">
          <div data-automation-id="formField-phoneDeviceType">
            <label id="device-label">Phone Device Type<span>*</span></label>
            <button role="combobox" aria-labelledby="device-label" aria-controls="device-options">Emergency - Mobile</button>
            <div id="device-options" role="listbox">
              <div role="option">Select One</div>
              <div role="option">Emergency - Landline</div>
              <div role="option">Emergency - Mobile</div>
              <div role="option">Fax</div>
              <div role="option">Landline</div>
              <div role="option">Mobile</div>
            </div>
          </div>
          <div data-automation-id="formField-phoneNumber"><label for="phone">Phone Number<span>*</span></label><input id="phone" /></div>
          <div data-automation-id="formField-phoneExtension"><label for="extension">Phone Extension</label><input id="extension" /></div>
        </section>
      </form>`,
      "https://factset.wd108.myworkdayjobs.com/jobs/apply",
    );
    expect(adapter.id).toBe("workday");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));

    expect(byLabel.get("Phone Device Type*")).toMatchObject({ canonicalKey: "answers.workday_phone_device_type", value: "Mobile" });
    expect(byLabel.get("Phone Number*")).toMatchObject({ canonicalKey: "identity.phone", value: profile.identity.phone });
    expect(byLabel.get("Phone Extension")?.canonicalKey).toBe("unknown");
  });

  it("maps Workday address fields from formField wrappers", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form data-automation-id="workdayApplication">
        <section>
          <div data-automation-id="formField-addressLine1"><label for="street">Address Line 1</label><input id="street" /></div>
          <div data-automation-id="formField-city"><label for="city">City</label><input id="city" /></div>
          <div data-automation-id="formField-region"><label for="region">Region</label><input id="region" /></div>
          <div data-automation-id="formField-postalCode"><label for="postal">Postal Code</label><input id="postal" /></div>
        </section>
      </form>`,
      "https://factset.wd108.myworkdayjobs.com/jobs/apply",
    );
    expect(adapter.id).toBe("workday");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["location.street", "location.city", "location.state", "location.postalCode"]),
    );
    expect(byLabel.get("Address Line 1")).toMatchObject({ canonicalKey: "location.street", value: "1 Market St" });
    expect(byLabel.get("City")).toMatchObject({ canonicalKey: "location.city", value: "San Francisco" });
    expect(byLabel.get("Postal Code")).toMatchObject({ canonicalKey: "location.postalCode", value: "94105" });
  });

  it("answers Workday AI opt-out and future-contact dropdown questions with safe defaults", async () => {
    const { adapter, fields } = await loadHtml(
      `<!doctype html>
      <form data-automation-id="workdayApplication">
        <div data-automation-id="formField-aiOptOut">
          <label id="ai-label">Do you request to opt-out of the use of artificial intelligence in the recruitment process?<span>*</span></label>
          <button role="combobox" aria-labelledby="ai-label" aria-controls="ai-options">Select One</button>
          <div id="ai-options" role="listbox">
            <div role="option">I wish to opt out</div>
            <div role="option">I do not wish to opt out</div>
          </div>
        </div>
        <div data-automation-id="formField-futureContact">
          <label id="contact-label">Do you agree to be contacted in future if you are a good fit for another role?<span>*</span></label>
          <button role="combobox" aria-labelledby="contact-label" aria-controls="contact-options">Select One</button>
          <div id="contact-options" role="listbox">
            <div role="option">Yes, I agree</div>
            <div role="option">No, I do not agree</div>
          </div>
        </div>
      </form>`,
      "https://acme.wd5.myworkdayjobs.com/jobs/job/1",
    );
    expect(adapter.id).toBe("workday");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    const byLabel = new Map(fields.map((field, index) => [field.label, mappings[index]]));
    const aiOptOutLabel = fields.find((field) => /artificial intelligence/i.test(field.label))?.label;
    const futureContactLabel = fields.find((field) => /good fit for another role/i.test(field.label))?.label;

    expect(byLabel.get(aiOptOutLabel ?? "")).toMatchObject({
      canonicalKey: "answers.screening.ai_recruiting_opt_out",
      value: "I do not wish to opt out",
      source: "heuristic",
    });
    expect(byLabel.get(futureContactLabel ?? "")).toMatchObject({
      canonicalKey: "answers.screening.future_role_contact_consent",
      value: "Yes, I agree",
      source: "heuristic",
    });
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
        label: "Do you know anyone currently employed by this organization?",
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
