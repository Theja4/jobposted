import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAutofillPlan,
  compactFields,
  countVisibleApplicationControls,
  ensureRepeaters,
  extractPageFields,
  hydrateChoiceFieldOptions,
  mergeProfileEducationPlan,
  type PageField,
} from "./autofill";
import type { ExtensionAutofillPlan, ExtensionAutofillPlanItem, ExtensionResumeResponse, MasterProfile } from "@jobposted/shared";

const nativeFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = nativeFetch;
  vi.restoreAllMocks();
});

const fixtures = import.meta.glob("../fixtures/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function installDom(html: string, url = "https://boards.greenhouse.io/acme/jobs/1") {
  const { document, window } = parseHTML(html);
  Object.defineProperty(window, "location", {
    value: new URL(url),
    configurable: true,
  });
  Object.assign(globalThis, {
    window,
    document,
    Event: window.Event,
    InputEvent: window.InputEvent ?? window.Event,
    FocusEvent: window.FocusEvent ?? window.Event,
    KeyboardEvent: window.KeyboardEvent ?? window.Event,
    MouseEvent: window.MouseEvent ?? window.Event,
    File: window.File ?? globalThis.File,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLSelectElement: window.HTMLSelectElement,
    CSS: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") },
  });
  return document;
}

function normalizedTestText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function profile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    identity: { firstName: "Asha", lastName: "Raman", email: "asha@example.com", phone: "+91 98765 43210" },
    location: { city: "Hyderabad", state: "Telangana", country: "India" },
    links: { website: [] },
    workAuth: { authorizedToWork: true, requiresSponsorship: false, country: "India" },
    compensation: { currency: "INR" },
    demographics: {},
    education: [{ school: "Osmania University", degree: "Bachelor's Degree", field: "Computer Science" }],
    experience: [],
    skills: ["React", "TypeScript"],
    answers: [],
    documents: {},
    ...overrides,
  };
}

describe("content autofill extraction", () => {
  it.each(["ashby", "greenhouse", "lever", "workday", "generic"])("extracts compact fields from %s fixture", (name) => {
    const html = fixtures[`../fixtures/${name}.html`];
    if (!html) throw new Error(`Missing fixture ${name}`);
    installDom(html);

    const fields = extractPageFields(document);
    const compact = compactFields(fields);

    expect(fields.length).toBeGreaterThan(0);
    expect(compact.every((field) => field.fieldId && field.label && field.type)).toBe(true);
    expect(JSON.stringify(compact)).not.toContain("<form");
  });

  it("applies a page-level plan to native inputs", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <label for="first">First name</label>
        <input id="first" />
        <label for="email">Email</label>
        <input id="email" type="email" />
      </form>`);
    const fields = extractPageFields(doc);
    const plan: ExtensionAutofillPlanItem[] = fields.map((field) => ({
      fieldId: field.fieldId,
      action: "fill",
      value: /email/i.test(field.label) ? "asha@example.com" : "Asha",
      optionLabel: null,
      confidence: 0.95,
      note: "test plan",
    }));
    const getResume = async (): Promise<ExtensionResumeResponse | null> => null;

    const records = await applyAutofillPlan({ fields, plan, getResume });

    expect(records.every((record) => record.status === "filled")).toBe(true);
    expect((doc.querySelector("#first") as HTMLInputElement).value).toBe("Asha");
    expect((doc.querySelector("#email") as HTMLInputElement).value).toBe("asha@example.com");
  });

  it("labels Greenhouse upload file inputs from the upload label instead of the Attach label", () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div class="file-upload">
          <div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div>
          <button type="button" class="btn btn--rectangle">Attach</button>
          <label class="visually-hidden" for="resume">Attach</label>
          <input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" />
          <button type="button" class="btn btn--rectangle" data-testid="resume-text">Enter manually</button>
        </div>
      </form>`);

    const fields = extractPageFields(doc);
    const resume = fields.find((field) => field.type === "file");

    expect(resume).toBeTruthy();
    expect(resume!.label).toMatch(/Resume\/CV/);
    expect(resume!.label).not.toBe("Attach");
    expect(resume!.required).toBe(true);
    expect(compactFields([resume!])[0]).toMatchObject({
      label: expect.stringMatching(/Resume\/CV/),
      type: "file",
      required: true,
    });
  });

  it("attaches Greenhouse resume file inputs labelled by the upload label", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div class="file-upload">
          <div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div>
          <button type="button" class="btn btn--rectangle">Attach</button>
          <label class="visually-hidden" for="resume">Attach</label>
          <input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" />
          <button type="button" class="btn btn--rectangle" data-testid="resume-text">Enter manually</button>
        </div>
      </form>`);
    globalThis.fetch = vi.fn(async () =>
      new Response(new Blob(["resume"], { type: "application/pdf" }), {
        headers: { "content-type": "application/pdf" },
      }),
    ) as typeof fetch;
    const fields = extractPageFields(doc);
    const resume = fields.find((field) => field.type === "file");
    expect(resume).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: resume!.fieldId,
          action: "attach",
          value: "Theja Resume.pdf",
          optionLabel: null,
          confidence: 0.96,
          note: "Attach stored resume.",
        },
      ],
      getResume: async () => ({
        ok: true,
        resumeUrl: "https://files.example.com/resume.pdf",
        resumeName: "Theja Resume.pdf",
        coverLetterUrl: null,
        coverLetterName: null,
        genericResumeUsed: true,
      }),
    });

    const input = doc.querySelector<HTMLInputElement>("#resume")!;
    expect(records[0]?.status).toBe("filled");
    expect(input.files?.item(0)?.name).toBe("Theja Resume.pdf");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://files.example.com/resume.pdf", { credentials: "omit" });
  });

  it("does not reattach a resume when an uploaded file row is already visible", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <section data-automation-id="resumeSection">
          <h3>Resume/CV</h3>
          <label for="resume">Upload a file</label>
          <input id="resume" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" />
          <div data-automation-id="uploadedFile">
            <span>Theja_Chitturi.pdf</span>
            <span>Successfully Uploaded!</span>
            <button type="button" aria-label="Delete">Delete</button>
          </div>
        </section>
      </form>`);
    globalThis.fetch = vi.fn(async () => {
      throw new Error("resume fetch should not run");
    }) as typeof fetch;
    const fields = extractPageFields(doc);
    const resume = fields.find((field) => field.type === "file");
    expect(resume).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: resume!.fieldId,
          action: "attach",
          value: "Theja_Chitturi.pdf",
          optionLabel: null,
          confidence: 0.96,
          note: "Attach stored resume.",
        },
      ],
      getResume: async () => ({
        ok: true,
        resumeUrl: "https://files.example.com/resume.pdf",
        resumeName: "Theja_Chitturi.pdf",
        coverLetterUrl: null,
        coverLetterName: null,
        genericResumeUsed: true,
      }),
    });

    const input = doc.querySelector<HTMLInputElement>("#resume")!;
    expect(records[0]?.status).toBe("skipped");
    expect(records[0]?.error).toBe("Already attached resume/CV.");
    expect(input.files?.length ?? 0).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["greenhouse", "School"],
    ["ashby", "How did you hear about us?"],
    ["workday", "Country"],
    ["generic", "authorized to work"],
  ])("extracts dropdown/listbox options from the %s fixture (%s)", (name, needle) => {
    installDom(fixtures[`../fixtures/${name}.html`]);
    const fields = extractPageFields(document);
    const field = fields.find((item) => item.label.toLowerCase().includes(needle.toLowerCase()));
    expect(field, `expected a "${needle}" field in ${name}`).toBeTruthy();
    expect(field!.options.length, `expected options for "${needle}" in ${name}`).toBeGreaterThan(0);
  });

  it("selects the Other option on a select2-backed dropdown", async () => {
    const doc = installDom(fixtures["../fixtures/greenhouse.html"]);
    const fields = extractPageFields(doc);
    const school = fields.find((item) => /school/i.test(item.label));
    expect(school).toBeTruthy();
    expect(school!.options).toContain("Other");

    const plan: ExtensionAutofillPlanItem[] = [
      {
        fieldId: school!.fieldId,
        action: "select",
        value: "Some Unlisted College",
        optionLabel: "Other",
        confidence: 0.6,
        note: "school not in the list",
      },
    ];
    const records = await applyAutofillPlan({ fields, plan, getResume: async () => null });
    expect(records[0]?.status).toBe("filled");
    const select = doc.querySelector("#gh-school") as HTMLSelectElement;
    const selected = Array.from(select.options).find((option) => option.selected);
    expect((selected?.textContent ?? select.value).toLowerCase()).toContain("other");
  });

  it("checks the correct option in a native radio group", async () => {
    const doc = installDom(fixtures["../fixtures/generic.html"]);
    const fields = extractPageFields(doc);
    const auth = fields.find((item) => /authorized to work/i.test(item.label));
    expect(auth).toBeTruthy();
    expect(auth!.options).toEqual(expect.arrayContaining(["Yes", "No"]));

    const plan: ExtensionAutofillPlanItem[] = [
      { fieldId: auth!.fieldId, action: "select", value: true, optionLabel: "Yes", confidence: 0.9, note: "work auth" },
    ];
    await applyAutofillPlan({ fields, plan, getResume: async () => null });
    expect((doc.querySelector("input[name='auth'][value='yes']") as HTMLInputElement).checked).toBe(true);
  });

  it("extracts and selects an Ashby-style Yes/No button group backed by a hidden checkbox", async () => {
    const doc = installDom(
      `<form>
        <div class="_fieldEntry_1e3gg_28 ashby-application-form-field-entry">
          <label class="_heading_f7cvd_52 _required_f7cvd_91 _label_x">Would you be able to be in office 5 days a week?</label>
          <div class="_container_1svni_28 _yesno_1e3gg_148">
            <button type="button" class="_container_pjyt6_1 _option_1svni_32">Yes</button>
            <button type="button" class="_container_pjyt6_1 _option_1svni_32">No</button>
            <input type="checkbox" class="_input_1svni_78" tabindex="-1" name="office-uuid">
          </div>
        </div>
      </form>`,
      "https://jobs.ashbyhq.com/acme/uuid/application",
    );
    // Simulate Ashby: clicking an option toggles a hashed "_active" class and clears its sibling.
    const buttons = Array.from(doc.querySelectorAll("button"));
    for (const button of buttons) {
      button.addEventListener("click", () => {
        const wasActive = button.classList.contains("_active_1svni_57");
        for (const sibling of buttons) sibling.classList.remove("_active_1svni_57");
        if (!wasActive) button.classList.add("_active_1svni_57");
      });
    }

    const fields = extractPageFields(doc);
    const office = fields.find((item) => /office 5 days/i.test(item.label));
    expect(office, "Yes/No group should be extracted despite the hidden value checkbox").toBeTruthy();
    expect(office!.type).toBe("radio");
    expect(office!.label).toMatch(/office 5 days a week/i); // the question, not "YesNo"
    expect(office!.options).toEqual(expect.arrayContaining(["Yes", "No"]));

    const plan: ExtensionAutofillPlanItem[] = [
      { fieldId: office!.fieldId, action: "select", value: true, optionLabel: "Yes", confidence: 0.9, note: "office" },
    ];
    const records = await applyAutofillPlan({ fields, plan, getResume: async () => null });
    expect(records[0]?.status).toBe("filled");
    const yes = buttons.find((button) => button.textContent === "Yes")!;
    expect(yes.classList.contains("_active_1svni_57"), "Yes should be selected (and not toggled back off)").toBe(true);
  });

  it("extracts and selects Ashby-style opacity:0 radios with label[for] options", async () => {
    const doc = installDom(
      `<form>
        <div class="_fieldEntry_1e3gg_28 ashby-application-form-field-entry">
          <label class="_heading_f7cvd_52 _required_f7cvd_91 _label_x">If you are not currently based in San Francisco, are you willing to relocate?</label>
          <div class="_radioGroup_x">
            <span><input type="radio" id="r0" name="relocate-uuid" style="opacity:0"><label for="r0">Yes</label></span>
            <span><input type="radio" id="r1" name="relocate-uuid" style="opacity:0"><label for="r1">No</label></span>
            <span><input type="radio" id="r2" name="relocate-uuid" style="opacity:0"><label for="r2">I am already based in San Francisco</label></span>
          </div>
        </div>
      </form>`,
      "https://jobs.ashbyhq.com/acme/uuid/application",
    );
    const fields = extractPageFields(doc);
    const relocate = fields.find((item) => /willing to relocate/i.test(item.label));
    expect(relocate, "opacity:0 radio group should still be extracted").toBeTruthy();
    expect(relocate!.type).toBe("radio");
    expect(relocate!.options).toEqual(expect.arrayContaining(["Yes", "No", "I am already based in San Francisco"]));

    const plan: ExtensionAutofillPlanItem[] = [
      { fieldId: relocate!.fieldId, action: "select", value: "Yes", optionLabel: "Yes", confidence: 0.9, note: "relocate" },
    ];
    const records = await applyAutofillPlan({ fields, plan, getResume: async () => null });
    expect(records[0]?.status).toBe("filled");
    expect((doc.querySelector("#r0") as HTMLInputElement).checked).toBe(true);
  });

  it("groups 'select all that apply' checkboxes into one multi-select question", () => {
    installDom(fixtures["../fixtures/greenhouse.html"]);
    const fields = extractPageFields(document);
    const sanctions = fields.filter((item) => /applies to you|sanction/i.test(item.label));
    expect(sanctions).toHaveLength(1);
    expect(sanctions[0].type).toBe("multiselect");
    expect(sanctions[0].options.length).toBeGreaterThanOrEqual(3);
    expect(sanctions[0].options.some((option) => /none of the above/i.test(option))).toBe(true);
    // The individual option texts must NOT each become their own question.
    expect(fields.some((item) => /^citizen or permanent resident of cuba/i.test(item.label))).toBe(false);
  });

  it("sends Yes/No options for a work-authorization dropdown (no free-text)", () => {
    installDom(fixtures["../fixtures/greenhouse.html"]);
    const fields = extractPageFields(document);
    const workAuth = fields.find((item) => /authorized to work/i.test(item.label));
    expect(workAuth).toBeTruthy();
    expect(workAuth!.type).not.toBe("text");
    expect(workAuth!.options).toEqual(expect.arrayContaining(["Yes", "No"]));
  });

  it("hydrates closed Greenhouse React selects from embedded application metadata", () => {
    const doc = installDom(`<!doctype html>
      <script>
        window.__remixContext = {
          "state": {
            "loaderData": {
              "job": {
                "questions": [{
                  "required": true,
                  "label": "Are you legally authorized to work in the United States?",
                  "fields": [{
                    "name": "question_35961878002",
                    "type": "multi_value_single_select",
                    "values": [
                      { "value": 238588662002, "label": "I am authorized to work in the United States for any employer" },
                      { "value": 238588664002, "label": "I require sponsorship to work in the United States" },
                      { "value": 238588665002, "label": "I am not authorized to work in the United States" }
                    ]
                  }]
                }]
              }
            }
          }
        };
      </script>
      <form id="application-form" class="application--form">
        <fieldset class="phone-input"><legend>Phone</legend><input id="phone" /></fieldset>
        <div class="field-wrapper">
          <div class="select">
            <div class="select__container">
              <label id="question_35961878002-label" for="question_35961878002" class="label select__label">
                Are you legally authorized to work in the United States?<span aria-hidden="true">*</span>
              </label>
              <div class="select-shell">
                <div class="select__control">
                  <div class="select__placeholder">Select...</div>
                  <input id="question_35961878002" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="question_35961878002-label" />
                </div>
                <input required tabindex="-1" aria-hidden="true" class="requiredInput" value="" />
              </div>
            </div>
          </div>
        </div>
      </form>`);
    const fields = extractPageFields(doc);
    const workAuth = fields.find((item) => /authorized to work/i.test(item.label));

    expect(workAuth).toBeTruthy();
    expect(workAuth!.required).toBe(true);
    expect(workAuth!.section).not.toBe("Phone");
    expect(workAuth!.options).toEqual([
      "I am authorized to work in the United States for any employer",
      "I require sponsorship to work in the United States",
      "I am not authorized to work in the United States",
    ]);
    expect(compactFields([workAuth!])[0]?.optionMode).toBe("full");
  });

  it("marks Lever custom questions required from their wrapper and metadata", () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div class="section page-centered application-form" data-qa="additional-cards">
          <h4 data-qa="card-name">Eligibility Questions</h4>
          <input type="hidden" value='{"text":"Eligibility Questions","fields":[{"type":"dropdown","text":"Will you now or in the future require sponsorship for employment?","required":true,"id":"field1","options":[{"text":"Yes"},{"text":"No"}]}]}' name="cards[abc][baseTemplate]" />
          <ul>
            <li class="application-question custom-question">
              <div>
                <div class="application-label full-width dropdown">
                  <div class="text">Will you now or in the future require sponsorship for employment?<span class="required">✱</span></div>
                </div>
                <div class="application-field full-width required-field">
                  <div class="application-dropdown">
                    <select name="cards[abc][field0]">
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </form>`, "https://jobs.lever.co/acme/1/apply");
    const fields = extractPageFields(doc);
    const sponsorship = fields.find((item) => /future require sponsorship/i.test(item.label));

    expect(sponsorship).toBeTruthy();
    expect(sponsorship!.required).toBe(true);
    expect(sponsorship!.options).toEqual(["Yes", "No"]);
    expect(compactFields([sponsorship!])[0]).toMatchObject({ required: true, optionMode: "full" });
  });

  it("checks the chosen option in a 'select all that apply' group", async () => {
    const doc = installDom(fixtures["../fixtures/greenhouse.html"]);
    const fields = extractPageFields(doc);
    const sanctions = fields.find((item) => /applies to you|sanction/i.test(item.label));
    expect(sanctions).toBeTruthy();
    const plan: ExtensionAutofillPlanItem[] = [
      {
        fieldId: sanctions!.fieldId,
        action: "select",
        value: ["None of the above"],
        optionLabel: "None of the above",
        confidence: 0.6,
        note: "compliance default",
      },
    ];
    await applyAutofillPlan({ fields, plan, getResume: async () => null });
    const none = Array.from(
      doc.querySelectorAll<HTMLInputElement>("input[name='job_application[sanctions][]']"),
    ).find((box) => /none of the above/i.test(box.closest("label")?.textContent ?? ""));
    expect(none?.checked).toBe(true);
  });

  it("defaults compliance checkbox groups to the neutral option when the model skips them", async () => {
    const doc = installDom(`<!doctype html>
      <fieldset>
        <legend>Please confirm whether any of the below applies to you. Select all that apply. This information will only be used to ensure compliance with U.S. sanctions and export controls.</legend>
        <label><input type="checkbox" name="sanctions" /> Citizen or permanent resident of Cuba, Iran, North Korea, or Syria</label>
        <label><input type="checkbox" name="sanctions" /> Ordinarily a resident of Russia or Belarus and not willing to relocate</label>
        <label><input id="none" type="checkbox" name="sanctions" /> None of the above</label>
      </fieldset>`);
    const fields = extractPageFields(doc);
    const sanctions = fields.find((item) => /select all that apply|sanctions/i.test(item.label));
    expect(sanctions).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: sanctions!.fieldId,
          action: "skip",
          value: null,
          optionLabel: null,
          confidence: 0.4,
          note: "empty model answer",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect((doc.querySelector("#none") as HTMLInputElement).checked).toBe(true);
  });

  it("keeps Greenhouse checkbox fieldsets separate and selects the neutral answer in each", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <fieldset class="checkbox" id="question_1">
          <input id="sanction_cuba" type="checkbox" name="question_1[]" description="Please confirm whether any of the below applies to you. Select all that apply. This information will only be used to ensure compliance with U.S. sanctions and export controls." />
          <label for="sanction_cuba">Citizen or permanent resident of Cuba, Iran, North Korea, or Syria</label>
          <input id="sanction_resident" type="checkbox" name="question_1[]" description="Please confirm whether any of the below applies to you. Select all that apply. This information will only be used to ensure compliance with U.S. sanctions and export controls." checked />
          <label for="sanction_resident">Ordinarily a resident of Russia or Belarus and not willing to relocate</label>
          <input id="sanction_none" type="checkbox" name="question_1[]" description="Please confirm whether any of the below applies to you. Select all that apply. This information will only be used to ensure compliance with U.S. sanctions and export controls." />
          <label for="sanction_none">None of the above</label>
        </fieldset>
        <fieldset class="checkbox" id="question_2">
          <input id="status_citizen" type="checkbox" name="question_2[]" description="If you selected a response to the prior question other than none of the above, please confirm whether any of the following also applies to you. Select all that apply." />
          <label for="status_citizen">U.S. citizen</label>
          <input id="status_none" type="checkbox" name="question_2[]" description="If you selected a response to the prior question other than none of the above, please confirm whether any of the following also applies to you. Select all that apply." />
          <label for="status_none">None of these apply to me</label>
          <input id="status_na" type="checkbox" name="question_2[]" description="If you selected a response to the prior question other than none of the above, please confirm whether any of the following also applies to you. Select all that apply." />
          <label for="status_na">Not applicable (i.e., I selected none of the above for the prior question)</label>
        </fieldset>
      </form>`);
    const fields = extractPageFields(doc).filter((item) => item.type === "multiselect");

    expect(fields).toHaveLength(2);
    expect(fields[0]!.label).toMatch(/sanctions and export controls/i);
    expect(fields[1]!.label).toMatch(/prior question/i);

    const records = await applyAutofillPlan({
      fields,
      plan: fields.map((field) => ({
        fieldId: field.fieldId,
        action: "skip",
        value: null,
        optionLabel: null,
        confidence: 0.4,
        note: "empty model answer",
      })),
      getResume: async () => null,
    });

    expect(records.map((record) => record.status)).toEqual(["filled", "filled"]);
    expect((doc.querySelector("#sanction_none") as HTMLInputElement).checked).toBe(true);
    expect((doc.querySelector("#sanction_resident") as HTMLInputElement).checked).toBe(false);
    expect((doc.querySelector("#status_na") as HTMLInputElement).checked).toBe(true);
    expect((doc.querySelector("#status_none") as HTMLInputElement).checked).toBe(false);
  });

  it("opens custom dropdowns before planning so verbose options are sent and selected", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div class="field">
          <label id="gov-label">Are you a current government official or were you a government official in the last five years?</label>
          <div id="gov" role="combobox" aria-haspopup="listbox" aria-labelledby="gov-label" aria-controls="gov-options" tabindex="0">Select...</div>
        </div>
      </form>`);
    const trigger = doc.querySelector<HTMLElement>("#gov")!;
    const ensureMenu = () => {
      if (doc.querySelector("#gov-options")) return;
      const list = doc.createElement("ul");
      list.id = "gov-options";
      list.setAttribute("role", "listbox");
      for (const label of [
        "No, I am not a current or former Government Official",
        "Yes, I am a current Government Official",
        "Yes, I am a former Government Official",
      ]) {
        const option = doc.createElement("li");
        option.setAttribute("role", "option");
        option.textContent = label;
        option.addEventListener("click", () => {
          trigger.textContent = label;
          list.remove();
        });
        list.append(option);
      }
      doc.body.append(list);
    };
    trigger.addEventListener("click", ensureMenu);

    const fields = extractPageFields(doc);
    const gov = fields.find((item) => /government official/i.test(item.label));
    expect(gov).toBeTruthy();
    expect(gov!.options).toHaveLength(0);

    await hydrateChoiceFieldOptions(fields, { waitMs: 0 });
    expect(gov!.options).toEqual([
      "No, I am not a current or former Government Official",
      "Yes, I am a current Government Official",
      "Yes, I am a former Government Official",
    ]);
    expect(compactFields(fields).find((item) => item.fieldId === gov!.fieldId)?.options).toContain(
      "No, I am not a current or former Government Official",
    );

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: gov!.fieldId,
          action: "select",
          value: false,
          optionLabel: "No",
          confidence: 0.9,
          note: "screening default",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(trigger.textContent).toBe("No, I am not a current or former Government Official");
  });

  it("treats fill plans on searchable dropdowns as real option selections", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <label for="gov">Government official?</label>
        <input id="gov" role="combobox" aria-autocomplete="list" aria-controls="gov-options" />
      </form>`);
    const input = doc.querySelector<HTMLInputElement>("#gov")!;
    const ensureMenu = () => {
      doc.querySelector("#gov-options")?.remove();
      const list = doc.createElement("ul");
      list.id = "gov-options";
      list.setAttribute("role", "listbox");
      for (const label of [
        "No, I am not a current or former Government Official",
        "Yes, I am a current Government Official",
        "Yes, I am a former Government Official",
      ]) {
        const option = doc.createElement("li");
        option.setAttribute("role", "option");
        option.textContent = label;
        option.addEventListener("click", () => {
          input.value = label;
          list.remove();
        });
        list.append(option);
      }
      doc.body.append(list);
    };
    input.addEventListener("input", ensureMenu);

    const fields = extractPageFields(doc);
    const gov = fields.find((item) => /government official/i.test(item.label));
    expect(gov).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: gov!.fieldId,
          action: "fill",
          value: "No",
          optionLabel: null,
          confidence: 0.9,
          note: "AA returned fill, but this is a dropdown.",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(input.value).toBe("No, I am not a current or former Government Official");
  });

  it("extracts React select wrappers and clicks their menu options instead of typing into the search input", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div id="auth-select" class="select">
          <label>Are you legally authorized to work in the country in which you are applying? *</label>
          <div class="select-shell">
            <div>
              <div id="auth-control" class="select__control">
                <input class="select__input" />
              </div>
              <button type="button" aria-label="Toggle flyout"></button>
            </div>
          </div>
        </div>
        <div id="portal-root"></div>
      </form>`);
    const root = doc.getElementById("auth-select") as HTMLElement;
    const input = doc.querySelector<HTMLInputElement>(".select__input")!;
    input.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown") return;
      if (doc.getElementById("auth-option-yes")) return;
      const menu = doc.createElement("div");
      menu.className = "select__menu";
      const yes = doc.createElement("div");
      yes.id = "auth-option-yes";
      yes.className = "select__option";
      yes.textContent = "Yes";
      const no = doc.createElement("div");
      no.className = "select__option";
      no.textContent = "No";
      yes.addEventListener("mousedown", () => {
        const selected = doc.createElement("div");
        selected.className = "select__single-value";
        selected.textContent = "Yes";
        root.append(selected);
        menu.remove();
      });
      menu.append(yes, no);
      doc.getElementById("portal-root")?.append(menu);
    });

    const fields = extractPageFields(doc);
    const auth = fields.find((item) => /legally authorized/i.test(item.label));
    expect(auth).toBeTruthy();
    expect(fields.some((item) => item.element === doc.querySelector(".select__input"))).toBe(false);
    expect(auth!.element).toBe(root);
    expect(auth!.type).toBe("combobox");

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: auth!.fieldId,
          action: "select",
          value: true,
          optionLabel: "Yes",
          confidence: 0.9,
          note: "work auth",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(root.textContent).toContain("Yes");
    expect((doc.querySelector(".select__input") as HTMLInputElement).value).toBe("");
  });

  it("waits for React select state to commit after clicking an option", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div id="auth-select" class="select">
          <label>Are you legally authorized to work in the country in which you are applying? *</label>
          <div class="select-shell">
            <div>
              <div class="select__control">
                <input class="select__input" role="combobox" aria-autocomplete="list" />
              </div>
            </div>
            <input required tabindex="-1" aria-hidden="true" class="requiredInput" value="" />
          </div>
        </div>
        <div id="portal-root"></div>
      </form>`);
    const root = doc.getElementById("auth-select") as HTMLElement;
    const input = doc.querySelector<HTMLInputElement>(".select__input")!;
    input.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" || doc.getElementById("auth-option-yes")) return;
      const menu = doc.createElement("div");
      menu.className = "select__menu";
      const yes = doc.createElement("div");
      yes.id = "auth-option-yes";
      yes.className = "select__option";
      yes.textContent = "Yes";
      yes.addEventListener("mousedown", () => {
        window.setTimeout(() => {
          const selected = doc.createElement("div");
          selected.className = "select__single-value";
          selected.textContent = "Yes";
          root.querySelector("input[required]")?.remove();
          root.append(selected);
          menu.remove();
        }, 1050);
      });
      menu.append(yes);
      doc.getElementById("portal-root")?.append(menu);
    });

    const fields = extractPageFields(doc);
    const auth = fields.find((item) => /legally authorized/i.test(item.label));
    expect(auth).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: auth!.fieldId,
          action: "select",
          value: true,
          optionLabel: "Yes",
          confidence: 0.9,
          note: "work auth",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(root.querySelector(".select__single-value")?.textContent).toBe("Yes");
    expect(root.querySelector("input[required]")).toBeNull();
  });

  it("waits for async searchable location options after typing", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div id="location-select" class="select">
          <label id="candidate-location-label">Location (City)*</label>
          <div class="select-shell">
            <div class="select__control">
              <div class="select__placeholder">Select...</div>
              <input id="candidate-location" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="candidate-location-label" />
            </div>
            <input required tabindex="-1" aria-hidden="true" class="requiredInput" value="" />
          </div>
        </div>
        <div id="portal-root"></div>
      </form>`);
    const root = doc.getElementById("location-select") as HTMLElement;
    const input = doc.getElementById("candidate-location") as HTMLInputElement;
    let searchTimer: number | null = null;
    const commitChoice = (choice: string) => {
      root.querySelector("input[required]")?.remove();
      root.querySelector(".select__single-value")?.remove();
      const selected = doc.createElement("div");
      selected.className = "select__single-value";
      selected.textContent = choice;
      root.append(selected);
      doc.getElementById("location-listbox")?.remove();
    };
    input.addEventListener("input", () => {
      if (!/hyderabad/i.test(input.value) || searchTimer != null) return;
      searchTimer = window.setTimeout(() => {
        const list = doc.createElement("div");
        list.id = "location-listbox";
        list.setAttribute("role", "listbox");
        input.setAttribute("aria-controls", "location-listbox");
        const option = doc.createElement("div");
        option.id = "location-option-hyderabad";
        option.className = "select__option";
        option.setAttribute("role", "option");
        option.textContent = "Hyderabad, Telangana, India";
        option.addEventListener("mousedown", () => commitChoice("Hyderabad, Telangana, India"));
        list.append(option);
        doc.getElementById("portal-root")?.append(list);
      }, 950);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const option = doc.querySelector<HTMLElement>("#location-listbox [role='option']");
        if (option) commitChoice(option.textContent ?? "");
      }
    });

    const fields = extractPageFields(doc);
    const location = fields.find((item) => /location/i.test(item.label));
    expect(location).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: location!.fieldId,
          action: "select",
          value: "Hyderabad",
          optionLabel: "Hyderabad",
          confidence: 0.9,
          note: "Profile city.",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(root.querySelector(".select__single-value")?.textContent).toBe("Hyderabad, Telangana, India");
    expect(root.querySelector("input[required]")).toBeNull();
  });

  it("searches Greenhouse city autocomplete with the city part when the plan value includes state and country", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div id="location-select" class="select">
          <label id="candidate-location-label">Location (City)*</label>
          <div class="select-shell">
            <div class="select__control">
              <div class="select__placeholder">Select...</div>
              <input id="candidate-location" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="candidate-location-label" />
            </div>
            <input required tabindex="-1" aria-hidden="true" class="requiredInput" value="" />
          </div>
        </div>
        <div id="portal-root"></div>
      </form>`);
    const root = doc.getElementById("location-select") as HTMLElement;
    const input = doc.getElementById("candidate-location") as HTMLInputElement;
    const commitChoice = (choice: string) => {
      root.querySelector("input[required]")?.remove();
      root.querySelector(".select__single-value")?.remove();
      const selected = doc.createElement("div");
      selected.className = "select__single-value";
      selected.textContent = choice;
      root.append(selected);
      doc.getElementById("location-listbox")?.remove();
    };
    input.addEventListener("input", () => {
      doc.getElementById("location-listbox")?.remove();
      if (input.value !== "Hyderabad") return;
      const list = doc.createElement("div");
      list.id = "location-listbox";
      list.setAttribute("role", "listbox");
      input.setAttribute("aria-controls", "location-listbox");
      for (const choice of ["Hyderabad, Andhra Pradesh, India", "Hyderabad, Telangana, India"]) {
        const option = doc.createElement("div");
        option.className = "select__option";
        option.setAttribute("role", "option");
        option.textContent = choice;
        option.addEventListener("mousedown", () => commitChoice(choice));
        list.append(option);
      }
      doc.getElementById("portal-root")?.append(list);
    });

    const fields = extractPageFields(doc);
    const location = fields.find((item) => /location/i.test(item.label));
    expect(location).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: location!.fieldId,
          action: "select",
          value: "Hyderabad, Telangana, India",
          optionLabel: null,
          confidence: 0.9,
          note: "Profile city with state and country.",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(input.value).toBe("Hyderabad");
    expect(root.querySelector(".select__single-value")?.textContent).toBe("Hyderabad, Telangana, India");
    expect(root.querySelector("input[required]")).toBeNull();
  });

  it("types Greenhouse city autocomplete searches with keyboard events and ignores stale phone options", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div id="phone-country-menu" role="listbox">
          <div role="option">Afghanistan +93</div>
          <div role="option">India +91</div>
        </div>
        <div id="location-select" class="select">
          <label id="candidate-location-label">Location (City)*</label>
          <div class="select-shell">
            <div class="select__control">
              <div class="select__placeholder">Select...</div>
              <input id="candidate-location" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="candidate-location-label" />
            </div>
            <input required tabindex="-1" aria-hidden="true" class="requiredInput" value="" />
          </div>
        </div>
        <div id="portal-root"></div>
      </form>`);
    const root = doc.getElementById("location-select") as HTMLElement;
    const input = doc.getElementById("candidate-location") as HTMLInputElement;
    const commitChoice = (choice: string) => {
      root.querySelector("input[required]")?.remove();
      root.querySelector(".select__single-value")?.remove();
      const selected = doc.createElement("div");
      selected.className = "select__single-value";
      selected.textContent = choice;
      root.append(selected);
      doc.getElementById("location-listbox")?.remove();
    };
    input.addEventListener("keyup", () => {
      doc.getElementById("location-listbox")?.remove();
      if (input.value !== "Hyderabad") return;
      const list = doc.createElement("div");
      list.id = "location-listbox";
      list.setAttribute("role", "listbox");
      input.setAttribute("aria-controls", "location-listbox");
      for (const choice of ["Hyderabad, Andhra Pradesh, India", "Hyderabad, Telangana, India"]) {
        const option = doc.createElement("div");
        option.className = "select__option";
        option.setAttribute("role", "option");
        option.textContent = choice;
        option.addEventListener("mousedown", () => commitChoice(choice));
        list.append(option);
      }
      doc.getElementById("portal-root")?.append(list);
    });

    const fields = extractPageFields(doc);
    const location = fields.find((item) => /location/i.test(item.label));
    expect(location).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: location!.fieldId,
          action: "select",
          value: "Hyderabad, Telangana, India",
          optionLabel: null,
          confidence: 0.9,
          note: "Profile city with state and country.",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(input.value).toBe("Hyderabad");
    expect(root.querySelector(".select__single-value")?.textContent).toBe("Hyderabad, Telangana, India");
    expect(root.querySelector("input[required]")).toBeNull();
  });

  it("ignores stale global country-code options when filling the active Greenhouse dropdown", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div class="select" id="country-select">
          <label>Country *</label>
          <input id="country" class="select__input" />
        </div>
        <div id="auth-select" class="select">
          <label>Are you legally authorized to work in the country in which you are applying? *</label>
          <div class="select-shell">
            <div class="select__control">
              <input id="question_auth" class="select__input" role="combobox" aria-autocomplete="list" aria-controls="auth-listbox" />
            </div>
            <input required tabindex="-1" aria-hidden="true" class="requiredInput" value="" />
          </div>
        </div>
        <ul id="iti-0__country-listbox" role="listbox">
          <li role="option">Afghanistan +93</li>
          <li role="option">India +91</li>
        </ul>
        <div id="portal-root"></div>
      </form>`);
    const root = doc.getElementById("auth-select") as HTMLElement;
    const input = doc.querySelector<HTMLInputElement>("#question_auth")!;
    input.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" || doc.getElementById("auth-listbox")) return;
      const list = doc.createElement("div");
      list.id = "auth-listbox";
      list.setAttribute("role", "listbox");
      const yes = doc.createElement("div");
      yes.className = "select__option";
      yes.setAttribute("role", "option");
      yes.textContent = "Yes";
      yes.addEventListener("mousedown", () => {
        root.querySelector("input[required]")?.remove();
        const selected = doc.createElement("div");
        selected.className = "select__single-value";
        selected.textContent = "Yes";
        root.append(selected);
        list.remove();
      });
      const no = doc.createElement("div");
      no.className = "select__option";
      no.setAttribute("role", "option");
      no.textContent = "No";
      list.append(yes, no);
      doc.getElementById("portal-root")?.append(list);
    });

    const fields = extractPageFields(doc);
    const auth = fields.find((item) => /legally authorized/i.test(item.label));
    expect(auth).toBeTruthy();
    expect(auth!.currentValue).toBeNull();
    expect(fields.some((item) => /^search$/i.test(item.label) || /list of countries/i.test(item.label))).toBe(false);

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: auth!.fieldId,
          action: "select",
          value: true,
          optionLabel: "Yes",
          confidence: 0.9,
          note: "work auth",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(root.querySelector(".select__single-value")?.textContent).toBe("Yes");
    expect(root.textContent).not.toContain("Afghanistan");
  });

  it("ignores zero-size phone country options while selecting Greenhouse education dropdowns", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div id="degree-select" class="select">
          <label id="degree--0-label">Degree*</label>
          <div class="select-shell">
            <div class="select__control">
              <div class="select__placeholder">Select...</div>
              <input id="degree--0" class="select__input" role="combobox" aria-labelledby="degree--0-label" />
            </div>
            <input required tabindex="-1" aria-hidden="true" class="requiredInput" value="" />
          </div>
        </div>
        <ul id="iti-0__country-listbox" role="listbox">
          <li role="option" id="country-af">Afghanistan +93</li>
          <li role="option" id="country-in">India +91</li>
        </ul>
        <div id="portal-root"></div>
      </form>`);
    const fields = extractPageFields(doc);
    const degree = fields.find((item) => item.label === "Degree*");
    expect(degree).toBeTruthy();

    const view = doc.defaultView as Window & { __jobpostedAutofillLayout?: boolean };
    view.__jobpostedAutofillLayout = true;
    const rect = (width: number, height: number, left = 0, top = 0) =>
      ({ width, height, left, top, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const setRect = (element: Element | null, width: number, height: number, left = 0, top = 0) => {
      if (!element) return;
      (element as HTMLElement).getBoundingClientRect = () => rect(width, height, left, top);
    };
    setRect(doc.getElementById("iti-0__country-listbox"), 0, 0);
    setRect(doc.getElementById("country-af"), 0, 0);
    setRect(doc.getElementById("country-in"), 0, 0);

    const root = doc.getElementById("degree-select") as HTMLElement;
    const input = doc.getElementById("degree--0") as HTMLInputElement;
    input.addEventListener("click", () => {
      if (doc.getElementById("react-select-degree--0-listbox")) return;
      input.setAttribute("aria-expanded", "true");
      input.setAttribute("aria-controls", "react-select-degree--0-listbox");
      const list = doc.createElement("div");
      list.id = "react-select-degree--0-listbox";
      list.setAttribute("role", "listbox");
      const associate = doc.createElement("div");
      associate.id = "react-select-degree--0-option-0";
      associate.className = "select__option";
      associate.setAttribute("role", "option");
      associate.textContent = "Associate's Degree";
      const bachelor = doc.createElement("div");
      bachelor.id = "react-select-degree--0-option-1";
      bachelor.className = "select__option";
      bachelor.setAttribute("role", "option");
      bachelor.textContent = "Bachelor's Degree";
      bachelor.addEventListener("mousedown", () => {
        root.querySelector("input[required]")?.remove();
        const selected = doc.createElement("div");
        selected.className = "select__single-value";
        selected.textContent = "Bachelor's Degree";
        root.append(selected);
        list.remove();
      });
      list.append(associate, bachelor);
      doc.getElementById("portal-root")?.append(list);
      setRect(list, 602, 302, 500, 490);
      setRect(associate, 600, 36, 501, 494);
      setRect(bachelor, 600, 36, 501, 530);
    });

    try {
      const records = await applyAutofillPlan({
        fields,
        plan: [
          {
            fieldId: degree!.fieldId,
            action: "select",
            value: "Bachelor's Degree",
            optionLabel: "Bachelor's Degree",
            confidence: 0.9,
            note: "Profile degree.",
          },
        ],
        getResume: async () => null,
      });

      expect(records[0]).toMatchObject({ status: "filled" });
      expect(root.querySelector(".select__single-value")?.textContent).toBe("Bachelor's Degree");
      expect(root.textContent).not.toContain("Afghanistan");
    } finally {
      delete view.__jobpostedAutofillLayout;
    }
  });

  it("overrides skipped Greenhouse education dropdowns with profile education", () => {
    const doc = installDom(`<!doctype html>
      <form>
        <section id="education-fields" class="education--container">
          <h2>Education</h2>
          <div id="school-select" class="select">
            <label id="school--0-label">School*</label>
            <div class="select__control">
              <input id="school--0" class="select__input" role="combobox" aria-labelledby="school--0-label" />
            </div>
            <div class="select__menu">
              <div role="option" class="select__option">0 - Not Applicable</div>
              <div role="option" class="select__option">0 - Other</div>
            </div>
          </div>
          <div id="degree-select" class="select">
            <label id="degree--0-label">Degree*</label>
            <div class="select__control">
              <input id="degree--0" class="select__input" role="combobox" aria-labelledby="degree--0-label" />
            </div>
            <div class="select__menu">
              <div role="option" class="select__option">Associate's Degree</div>
              <div role="option" class="select__option">Bachelor's Degree</div>
              <div role="option" class="select__option">Other</div>
            </div>
          </div>
          <div id="discipline-select" class="select">
            <label id="discipline--0-label">Discipline*</label>
            <div class="select__control">
              <input id="discipline--0" class="select__input" role="combobox" aria-labelledby="discipline--0-label" />
            </div>
            <div class="select__menu">
              <div role="option" class="select__option">Computer Science</div>
              <div role="option" class="select__option">Engineering</div>
              <div role="option" class="select__option">Other</div>
            </div>
          </div>
        </section>
      </form>`);
    const fields = extractPageFields(doc);
    const school = fields.find((item) => /school/i.test(item.label));
    const degree = fields.find((item) => /degree/i.test(item.label));
    const discipline = fields.find((item) => /discipline/i.test(item.label));
    expect(school).toBeTruthy();
    expect(degree).toBeTruthy();
    expect(discipline).toBeTruthy();
    expect(fields.filter((item) => item.repeater === "education")).toHaveLength(3);

    const skippedPlan: ExtensionAutofillPlan = {
      stepName: "Application",
      fields: fields.map((field) => ({
        fieldId: field.fieldId,
        action: "skip",
        value: null,
        optionLabel: null,
        confidence: 0.35,
        note: "model skipped",
      })),
    };

    const merged = mergeProfileEducationPlan(
      fields,
      skippedPlan,
      profile({
        education: [{ school: "University That Is Not Listed", degree: "Bachelor's Degree", field: "Computer Science" }],
      }),
    );
    const itemFor = (field: PageField | undefined) => merged.fields.find((item) => item.fieldId === field?.fieldId);

    expect(itemFor(school)).toMatchObject({ action: "select", value: "University That Is Not Listed", optionLabel: "0 - Other" });
    expect(itemFor(degree)).toMatchObject({ action: "select", value: "Bachelor's Degree", optionLabel: "Bachelor's Degree" });
    expect(itemFor(discipline)).toMatchObject({ action: "select", value: "Computer Science", optionLabel: "Computer Science" });
    expect(merged.fields.findIndex((item) => item.fieldId === degree!.fieldId)).toBeLessThan(
      merged.fields.findIndex((item) => item.fieldId === school!.fieldId),
    );
  });

  it("preserves concrete planner-selected degree and discipline but guards school fallback", () => {
    const doc = installDom(`<!doctype html>
      <form>
        <section id="education-fields" class="education--container">
          <h2>Education</h2>
          <div id="school-select" class="select">
            <label id="school--0-label">School*</label>
            <div class="select__control">
              <input id="school--0" class="select__input" role="combobox" aria-labelledby="school--0-label" />
            </div>
            <div class="select__menu">
              <div role="option" class="select__option">0 - Not Applicable</div>
              <div role="option" class="select__option">0 - Other</div>
            </div>
          </div>
          <div id="degree-select" class="select">
            <label id="degree--0-label">Degree*</label>
            <div class="select__control">
              <input id="degree--0" class="select__input" role="combobox" aria-labelledby="degree--0-label" />
            </div>
            <div class="select__menu">
              <div role="option" class="select__option">Bachelor's Degree</div>
              <div role="option" class="select__option">Other</div>
            </div>
          </div>
          <div id="discipline-select" class="select">
            <label id="discipline--0-label">Discipline*</label>
            <div class="select__control">
              <input id="discipline--0" class="select__input" role="combobox" aria-labelledby="discipline--0-label" />
            </div>
            <div class="select__menu">
              <div role="option" class="select__option">Computer Science</div>
              <div role="option" class="select__option">Engineering</div>
              <div role="option" class="select__option">Other</div>
            </div>
          </div>
        </section>
      </form>`);
    const fields = extractPageFields(doc);
    const school = fields.find((item) => /school/i.test(item.label));
    const degree = fields.find((item) => /degree/i.test(item.label));
    const discipline = fields.find((item) => /discipline/i.test(item.label));
    expect(school).toBeTruthy();
    expect(degree).toBeTruthy();
    expect(discipline).toBeTruthy();
    const plannerPlan: ExtensionAutofillPlan = {
      stepName: "Application",
      fields: fields.map((field) => ({
        fieldId: field.fieldId,
        action: field.fieldId === school?.fieldId || field.fieldId === degree?.fieldId || field.fieldId === discipline?.fieldId ? "select" : "skip",
        value:
          field.fieldId === school?.fieldId
            ? "University That Is Not Listed"
            : field.fieldId === degree?.fieldId
              ? "B.Tech"
              : field.fieldId === discipline?.fieldId
                ? "Electronics"
                : null,
        optionLabel:
          field.fieldId === school?.fieldId
            ? "Art Institute of Atlanta"
            : field.fieldId === degree?.fieldId
              ? "Bachelor's Degree"
              : field.fieldId === discipline?.fieldId
                ? "Engineering"
                : null,
        confidence: field.fieldId === school?.fieldId || field.fieldId === degree?.fieldId || field.fieldId === discipline?.fieldId ? 0.86 : 0.35,
        note:
          field.fieldId === school?.fieldId || field.fieldId === degree?.fieldId || field.fieldId === discipline?.fieldId
            ? "planner selected concrete option"
            : "model skipped",
      })),
    };

    const merged = mergeProfileEducationPlan(
      fields,
      plannerPlan,
      profile({
        education: [{ school: "University That Is Not Listed", degree: "B.Tech", field: "Electronics" }],
      }),
    );
    const itemFor = (field: PageField | undefined) => merged.fields.find((item) => item.fieldId === field?.fieldId);

    expect(itemFor(school)).toMatchObject({ action: "select", optionLabel: "0 - Other" });
    expect(itemFor(degree)).toMatchObject({ action: "select", value: "B.Tech", optionLabel: "Bachelor's Degree" });
    expect(itemFor(discipline)).toMatchObject({ action: "select", value: "Electronics", optionLabel: "Engineering" });
  });

  it("falls back to Other on education comboboxes when the school is not available", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <section id="education-fields" class="education--container">
          <h2>Education</h2>
          <div id="school-select" class="select">
            <label id="school--0-label">School*</label>
            <div class="select-shell">
              <div class="select__control">
                <div class="select__placeholder">Select...</div>
                <input id="school--0" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="school--0-label" />
              </div>
              <input class="requiredInput" required aria-hidden="true" value="" />
            </div>
          </div>
          <div id="portal-root"></div>
        </section>
      </form>`);
    const root = doc.getElementById("school-select") as HTMLElement;
    const input = doc.getElementById("school--0") as HTMLInputElement;
    input.addEventListener("click", () => {
      if (doc.getElementById("school-listbox")) return;
      input.setAttribute("aria-controls", "school-listbox");
      const list = doc.createElement("div");
      list.id = "school-listbox";
      list.setAttribute("role", "listbox");
      const notApplicable = doc.createElement("div");
      notApplicable.className = "select__option";
      notApplicable.setAttribute("role", "option");
      notApplicable.textContent = "0 - Not Applicable";
      const other = doc.createElement("div");
      other.className = "select__option";
      other.setAttribute("role", "option");
      other.textContent = "0 - Other";
      other.addEventListener("mousedown", () => {
        root.querySelector("input[required]")?.remove();
        const selected = doc.createElement("div");
        selected.className = "select__single-value";
        selected.textContent = "0 - Other";
        root.append(selected);
        list.remove();
      });
      list.append(notApplicable, other);
      doc.getElementById("portal-root")?.append(list);
    });

    const fields = extractPageFields(doc);
    const school = fields.find((item) => /school/i.test(item.label));
    expect(school).toBeTruthy();
    expect(school!.repeater).toBe("education");

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: school!.fieldId,
          action: "select",
          value: "University That Is Not Listed",
          optionLabel: null,
          confidence: 0.82,
          note: "Profile school.",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]).toMatchObject({ status: "filled" });
    expect(root.querySelector(".select__single-value")?.textContent).toBe("0 - Other");
  });

  it("fills Greenhouse education dropdowns when school fallback precedes exact degree and discipline options", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <section id="education-fields" class="education--container">
          <h2>Education</h2>
          <div id="school-select" class="select">
            <label id="school--0-label">School*</label>
            <div class="select-shell">
              <div class="select__control">
                <div class="select__placeholder">Select...</div>
                <input id="school--0" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="school--0-label" />
              </div>
              <input class="requiredInput" required aria-hidden="true" value="" />
            </div>
          </div>
          <div id="degree-select" class="select">
            <label id="degree--0-label">Degree*</label>
            <div class="select-shell">
              <div class="select__control">
                <div class="select__placeholder">Select...</div>
                <input id="degree--0" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="degree--0-label" />
              </div>
              <input class="requiredInput" required aria-hidden="true" value="" />
            </div>
          </div>
          <div id="discipline-select" class="select">
            <label id="discipline--0-label">Discipline*</label>
            <div class="select-shell">
              <div class="select__control">
                <div class="select__placeholder">Select...</div>
                <input id="discipline--0" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="discipline--0-label" />
              </div>
              <input class="requiredInput" required aria-hidden="true" value="" />
            </div>
          </div>
          <div id="portal-root"></div>
        </section>
      </form>`);
    const portal = doc.getElementById("portal-root") as HTMLElement;
    const attachMenu = (rootId: string, inputId: string, choices: string[]) => {
      const root = doc.getElementById(rootId) as HTMLElement;
      const input = doc.getElementById(inputId) as HTMLInputElement;
      const listId = `react-select-${inputId}-listbox`;
      const commitChoice = (choice: string) => {
        root.querySelector("input[required]")?.remove();
        root.querySelector(".select__single-value")?.remove();
        const selected = doc.createElement("div");
        selected.className = "select__single-value";
        selected.textContent = choice;
        root.append(selected);
        doc.getElementById(listId)?.remove();
      };
      const openMenu = () => {
        if (doc.getElementById(listId)) return;
        input.setAttribute("aria-controls", listId);
        const list = doc.createElement("div");
        list.id = listId;
        list.setAttribute("role", "listbox");
        choices.forEach((choice, index) => {
          const option = doc.createElement("div");
          option.id = `${listId}-option-${index}`;
          option.className = "select__option";
          option.setAttribute("role", "option");
          option.textContent = choice;
          option.addEventListener("mousedown", (event) => event.preventDefault());
          list.append(option);
        });
        portal.append(list);
      };
      input.addEventListener("click", openMenu);
      input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") openMenu();
        if (event.key === "Enter") {
          const wanted = normalizedTestText(input.value);
          const choice =
            choices.find((item) => normalizedTestText(item) === wanted) ??
            choices.find((item) => normalizedTestText(item).includes(wanted));
          if (choice) commitChoice(choice);
        }
        if (event.key === "Escape") doc.getElementById(listId)?.remove();
      });
    };
    attachMenu("school-select", "school--0", ["0 - Not Applicable", "0 - Other", "Aalborg University"]);
    attachMenu("degree-select", "degree--0", ["Associate's Degree", "Bachelor's Degree", "Other"]);
    attachMenu("discipline-select", "discipline--0", ["Computer Science", "Engineering", "Other"]);

    const fields = extractPageFields(doc);
    await hydrateChoiceFieldOptions(fields, { waitMs: 0 });
    const skippedPlan: ExtensionAutofillPlan = {
      stepName: "Application",
      fields: fields.map((field) => ({
        fieldId: field.fieldId,
        action: "skip",
        value: null,
        optionLabel: null,
        confidence: 0.35,
        note: "model skipped",
      })),
    };
    const merged = mergeProfileEducationPlan(
      fields,
      skippedPlan,
      profile({
        education: [{ school: "University That Is Not Listed", degree: "Bachelor's Degree", field: "Computer Science" }],
      }),
    );

    const records = await applyAutofillPlan({ fields, plan: merged.fields, getResume: async () => null });

    expect(records.filter((record) => record.status === "filled").map((record) => record.label)).toEqual([
      "Degree*",
      "Discipline*",
      "School*",
    ]);
    expect(doc.querySelector("#degree-select .select__single-value")?.textContent).toBe("Bachelor's Degree");
    expect(doc.querySelector("#discipline-select .select__single-value")?.textContent).toBe("Computer Science");
    expect(doc.querySelector("#school-select .select__single-value")?.textContent).toBe("0 - Other");
  }, 8000);

  it("does not let an async Greenhouse school search block degree selection", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <section id="education-fields" class="education--container">
          <h2>Education</h2>
          <div id="school-select" class="select">
            <label id="school--0-label">School*</label>
            <div class="select-shell">
              <div class="select__control">
                <div class="select__placeholder">Select...</div>
                <input id="school--0" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="school--0-label" />
              </div>
              <input class="requiredInput" required aria-hidden="true" value="" />
            </div>
          </div>
          <div id="degree-select" class="select">
            <label id="degree--0-label">Degree*</label>
            <div class="select-shell">
              <div class="select__control">
                <div class="select__placeholder">Select...</div>
                <input id="degree--0" class="select__input" role="combobox" aria-autocomplete="list" aria-labelledby="degree--0-label" />
              </div>
              <input class="requiredInput" required aria-hidden="true" value="" />
            </div>
          </div>
          <div id="portal-root"></div>
        </section>
      </form>`);
    const portal = doc.getElementById("portal-root") as HTMLElement;
    const degreeRoot = doc.getElementById("degree-select") as HTMLElement;
    const schoolInput = doc.getElementById("school--0") as HTMLInputElement;
    const degreeInput = doc.getElementById("degree--0") as HTMLInputElement;
    let schoolSearchEvents = 0;

    const openSchoolMenu = () => {
      if (doc.getElementById("school-listbox")) return;
      schoolInput.setAttribute("aria-controls", "school-listbox");
      const list = doc.createElement("div");
      list.id = "school-listbox";
      list.setAttribute("role", "listbox");
      const empty = doc.createElement("div");
      empty.textContent = "No options";
      list.append(empty);
      portal.append(list);
    };
    schoolInput.addEventListener("click", openSchoolMenu);
    schoolInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") openSchoolMenu();
    });
    schoolInput.addEventListener("input", () => {
      schoolSearchEvents += 1;
    });

    const openDegreeMenu = () => {
      if (doc.getElementById("degree-listbox")) return;
      degreeInput.setAttribute("aria-controls", "degree-listbox");
      const list = doc.createElement("div");
      list.id = "degree-listbox";
      list.setAttribute("role", "listbox");
      const bachelor = doc.createElement("div");
      bachelor.className = "select__option";
      bachelor.setAttribute("role", "option");
      bachelor.textContent = "Bachelor's Degree";
      bachelor.addEventListener("mousedown", () => {
        degreeRoot.querySelector("input[required]")?.remove();
        const selected = doc.createElement("div");
        selected.className = "select__single-value";
        selected.textContent = "Bachelor's Degree";
        degreeRoot.append(selected);
        list.remove();
      });
      list.append(bachelor);
      portal.append(list);
    };
    degreeInput.addEventListener("click", openDegreeMenu);
    degreeInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") openDegreeMenu();
    });

    const fields = extractPageFields(doc);
    const school = fields.find((item) => /school/i.test(item.label));
    const degree = fields.find((item) => /degree/i.test(item.label));
    expect(school).toBeTruthy();
    expect(degree).toBeTruthy();
    const skippedPlan: ExtensionAutofillPlan = {
      stepName: "Application",
      fields: fields.map((field) => ({
        fieldId: field.fieldId,
        action: "skip",
        value: null,
        optionLabel: null,
        confidence: 0.35,
        note: "model skipped",
      })),
    };
    const merged = mergeProfileEducationPlan(
      fields,
      skippedPlan,
      profile({
        education: [{ school: "University That Is Not Listed", degree: "Bachelor's Degree", field: "Computer Science" }],
      }),
    );

    const records = await applyAutofillPlan({ fields, plan: merged.fields, getResume: async () => null });

    expect(records.find((record) => record.label === "Degree*")?.status).toBe("filled");
    expect(records.find((record) => record.label === "School*")?.status).toBe("needs_user");
    expect(degreeRoot.querySelector(".select__single-value")?.textContent).toBe("Bachelor's Degree");
    expect(schoolSearchEvents).toBe(0);
  });

  it("keeps blank Greenhouse select wrappers in the fill plan instead of marking label text as current value", () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div id="auth-select" class="select">
          <label>Are you legally authorized to work in the country in which you are applying? *</label>
          <div class="select-shell">
            <div class="select__control">
              <div class="select__placeholder">Select...</div>
              <input id="question_auth" class="select__input" role="combobox" aria-autocomplete="list" aria-controls="auth-listbox" />
            </div>
          </div>
        </div>
        <ul id="iti-0__country-listbox" role="listbox" aria-label="List of countries">
          <li role="option">Afghanistan +93</li>
          <li role="option">India +91</li>
        </ul>
        <div class="iti__dropdown-content">
          <input id="iti-0__search-input" class="iti__search-input" role="combobox" aria-label="Search" />
        </div>
      </form>`);
    const fields = extractPageFields(doc);
    const auth = fields.find((item) => /legally authorized/i.test(item.label));

    expect(auth).toBeTruthy();
    expect(auth!.type).toBe("combobox");
    expect(auth!.required).toBe(true);
    expect(auth!.currentValue).toBeNull();
    expect(fields.some((item) => /^search$/i.test(item.label) || /list of countries/i.test(item.label))).toBe(false);
    expect(countVisibleApplicationControls(doc)).toBe(1);
  });

  it("does not treat React select aria-live search announcements as selected values", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div id="auth-select" class="select">
          <label>Are you legally authorized to work in the country in which you are applying? *</label>
          <div class="select-shell">
            <span aria-live="polite" role="log">Yes, 1 of 2. 2 results available.</span>
            <div>
              <div id="auth-control" class="select__control">
                <div class="select__placeholder">Select...</div>
                <input class="select__input" />
              </div>
              <button type="button" aria-label="Toggle flyout"></button>
            </div>
            <input required tabindex="-1" aria-hidden="true" value="" />
          </div>
        </div>
        <div id="portal-root">
          <div class="select__menu">
            <div id="auth-option-yes" class="select__option">Yes</div>
            <div class="select__option">No</div>
          </div>
        </div>
      </form>`);
    const input = doc.querySelector<HTMLInputElement>(".select__input")!;
    const yes = doc.getElementById("auth-option-yes") as HTMLElement;
    yes.addEventListener("mousedown", () => {
      input.value = "Yes";
    });

    const fields = extractPageFields(doc);
    const auth = fields.find((item) => /legally authorized/i.test(item.label));
    expect(auth).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: auth!.fieldId,
          action: "select",
          value: true,
          optionLabel: "Yes",
          confidence: 0.9,
          note: "work auth",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("needs_user");
    expect(input.value).toBe("");
    expect(doc.querySelector(".select__single-value")).toBeNull();
  });

  it("selects a sole confirmation option when the plan answers yes", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div id="privacy-select" class="select">
          <label>Please confirm receipt of the privacy notice *</label>
          <div class="select__control">
            <div class="select__placeholder">Select...</div>
            <input class="select__input" role="combobox" aria-controls="privacy-listbox" />
          </div>
        </div>
      </form>`);
    const root = doc.getElementById("privacy-select") as HTMLElement;
    root.addEventListener("click", () => {
      if (doc.getElementById("privacy-listbox")) return;
      const list = doc.createElement("div");
      list.id = "privacy-listbox";
      list.setAttribute("role", "listbox");
      const confirmed = doc.createElement("div");
      confirmed.className = "select__option";
      confirmed.setAttribute("role", "option");
      confirmed.textContent = "Confirmed";
      confirmed.addEventListener("mousedown", () => {
        const selected = doc.createElement("div");
        selected.className = "select__single-value";
        selected.textContent = "Confirmed";
        root.append(selected);
        list.remove();
      });
      list.append(confirmed);
      doc.body.append(list);
    });

    const fields = extractPageFields(doc);
    const privacy = fields.find((item) => /privacy notice/i.test(item.label));
    expect(privacy).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: privacy!.fieldId,
          action: "select",
          value: true,
          optionLabel: "Yes",
          confidence: 0.9,
          note: "confirmation",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(root.querySelector(".select__single-value")?.textContent).toBe("Confirmed");
  });

  it("extracts and selects button-toggle choice groups as a single field", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <section id="pronouns" aria-label="Preferred pronouns">
          <p>Preferred pronouns</p>
          <button type="button">He/Him</button>
          <button type="button">She/Her</button>
          <button type="button">They/Them</button>
        </section>
      </form>`);
    const buttons = Array.from(doc.querySelectorAll<HTMLButtonElement>("#pronouns button"));
    for (const button of buttons) {
      button.addEventListener("click", () => {
        for (const item of buttons) item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
    }

    const fields = extractPageFields(doc);
    const pronouns = fields.find((item) => /preferred pronouns/i.test(item.label));
    expect(pronouns).toBeTruthy();
    expect(pronouns!.type).toBe("radio");
    expect(pronouns!.options).toEqual(["He/Him", "She/Her", "They/Them"]);

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: pronouns!.fieldId,
          action: "select",
          value: "They/Them",
          optionLabel: "They/Them",
          confidence: 0.88,
          note: "profile preference",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect(buttons[2]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("fills phone inputs with national digits when the plan includes a country code", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <label for="phone">Phone</label>
        <input id="phone" type="tel" />
      </form>`);
    const fields = extractPageFields(doc);
    const phone = fields.find((item) => /phone/i.test(item.label));
    expect(phone).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: phone!.fieldId,
          action: "fill",
          value: "+91 73300 07006",
          optionLabel: null,
          confidence: 0.9,
          note: "Profile phone.",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]?.status).toBe("filled");
    expect((doc.querySelector("#phone") as HTMLInputElement).value).toBe("7330007006");
  });

  it("adds a second generic education row when the page exposes an add control", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <section id="education">
          <h2>Education</h2>
          <div class="row">
            <label for="school-1">School</label>
            <input id="school-1" />
          </div>
          <button type="button">Add another school</button>
        </section>
      </form>`);
    doc.querySelector("button")?.addEventListener("click", () => {
      const row = doc.createElement("div");
      row.className = "row";
      row.innerHTML = `<label for="school-2">School</label><input id="school-2" />`;
      doc.getElementById("education")?.append(row);
    });

    await ensureRepeaters(
      doc,
      profile({
        education: [
          { school: "First University", degree: "Bachelor's Degree", field: "Computer Science" },
          { school: "Second Institute", degree: "Master's Degree", field: "Data Science" },
        ],
      }),
    );

    const schools = extractPageFields(doc).filter((item) => /school/i.test(item.label));
    expect(doc.querySelector("#school-2")).toBeTruthy();
    expect(schools.map((item) => item.repeaterIndex)).toEqual([0, 1]);
  });

  it("uses a section-scoped plain Add button for generic experience rows", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <section id="experience">
          <h2>Work Experience</h2>
          <div class="row">
            <label for="title-1">Job Title</label>
            <input id="title-1" />
          </div>
          <button type="button">Add</button>
        </section>
        <section id="attachments">
          <h2>Attachments</h2>
          <button type="button" id="upload-add">Add</button>
        </section>
      </form>`);
    doc.querySelector("#experience button")?.addEventListener("click", () => {
      const row = doc.createElement("div");
      row.className = "row";
      row.innerHTML = `<label for="title-2">Job Title</label><input id="title-2" />`;
      doc.getElementById("experience")?.append(row);
    });
    doc.querySelector("#upload-add")?.addEventListener("click", () => {
      throw new Error("attachment add button should not be clicked");
    });

    await ensureRepeaters(
      doc,
      profile({
        experience: [
          { title: "Engineer", company: "Acme", startDate: "2023-01", endDate: null, current: true, bullets: [] },
          { title: "Intern", company: "Beta", startDate: "2022-01", endDate: "2022-06", current: false, bullets: [] },
        ],
      }),
    );

    const titles = extractPageFields(doc).filter((item) => /job title/i.test(item.label));
    expect(doc.querySelector("#title-2")).toBeTruthy();
    expect(titles.map((item) => item.repeaterIndex)).toEqual([0, 1]);
  });

  it("uses Greenhouse-style containers for generic add buttons and repeater context", async () => {
    const doc = installDom(`<!doctype html>
      <form class="application--form">
        <fieldset class="phone-input"><legend>Phone</legend><input id="phone" /></fieldset>
        <div id="employment-fields" class="employment--container">
          <label for="company-name-0">Company name</label>
          <input id="company-name-0" />
          <label for="title-0">Title</label>
          <input id="title-0" />
          <button type="button" class="add-another-button" id="employment-add">Add another</button>
        </div>
        <hr />
        <div id="education-fields" class="education--container">
          <div class="select">
            <label id="school--0-label">School*</label>
            <div class="select-shell">
              <input id="school--0" class="select__input" role="combobox" aria-labelledby="school--0-label" />
              <input class="requiredInput" required aria-hidden="true" />
            </div>
          </div>
          <button type="button" class="add-another-button" id="education-add">Add another</button>
        </div>
        <div class="application-heading"><h2>Voluntary Self-Identification</h2></div>
      </form>`);

    let employmentIndex = 1;
    doc.querySelector("#employment-add")?.addEventListener("click", () => {
      const row = doc.createElement("div");
      const index = employmentIndex++;
      row.innerHTML = `<label for="company-name-${index}">Company name</label><input id="company-name-${index}" />`;
      doc.getElementById("employment-fields")?.append(row);
    });
    let educationIndex = 1;
    doc.querySelector("#education-add")?.addEventListener("click", () => {
      const row = doc.createElement("div");
      const index = educationIndex++;
      row.innerHTML = `<div class="select">
        <label id="school--${index}-label">School*</label>
        <div class="select-shell">
          <input id="school--${index}" class="select__input" role="combobox" aria-labelledby="school--${index}-label" />
          <input class="requiredInput" required aria-hidden="true" />
        </div>
      </div>`;
      doc.getElementById("education-fields")?.append(row);
    });

    await ensureRepeaters(
      doc,
      profile({
        education: [
          { school: "Osmania University", degree: "Bachelor's Degree", field: "Computer Science" },
          { school: "JNTU Hyderabad", degree: "Master's Degree", field: "Data Science" },
          { school: "IIT Madras", degree: "Certificate", field: "Machine Learning" },
        ],
        experience: [
          { title: "Analyst", company: "ION Group", startDate: "2021", endDate: "2026", current: false, bullets: [] },
          { title: "Intern", company: "Virtusa", startDate: "2020", endDate: "2021", current: false, bullets: [] },
          { title: "Associate", company: "Acme", startDate: "2019", endDate: "2020", current: false, bullets: [] },
          { title: "Trainee", company: "Beta", startDate: "2018", endDate: "2019", current: false, bullets: [] },
        ],
      }),
    );

    const fields = extractPageFields(doc);
    const companies = fields.filter((item) => item.label === "Company name");
    const schools = fields.filter((item) => item.label === "School*");

    expect(doc.querySelector("#company-name-3")).toBeTruthy();
    expect(doc.querySelector("#school--2")).toBeTruthy();
    expect(companies.map((item) => item.section)).toEqual(["Employment", "Employment", "Employment", "Employment"]);
    expect(companies.map((item) => item.repeater)).toEqual(["experience", "experience", "experience", "experience"]);
    expect(companies.map((item) => item.repeaterIndex)).toEqual([0, 1, 2, 3]);
    expect(schools.map((item) => item.section)).toEqual(["Education", "Education", "Education"]);
    expect(schools.map((item) => item.repeater)).toEqual(["education", "education", "education"]);
    expect(schools.map((item) => item.repeaterIndex)).toEqual([0, 1, 2]);
  });

  it("treats a React-select required mirror value as a successful selection", async () => {
    const doc = installDom(`<!doctype html>
      <form>
        <div class="select">
          <label id="degree--0-label">Degree*</label>
          <div class="select-shell">
            <div class="select__control">
              <div class="select__value-container">Select...</div>
              <input id="degree--0" class="select__input" role="combobox" aria-labelledby="degree--0-label" />
            </div>
            <input class="requiredInput" required aria-hidden="true" />
          </div>
          <div class="select__menu">
            <div role="option" class="select__option">Associate's Degree</div>
            <div role="option" class="select__option" id="bachelors-option">Bachelor's Degree</div>
          </div>
        </div>
      </form>`);
    const mirror = doc.querySelector<HTMLInputElement>(".requiredInput");
    doc.querySelector("#bachelors-option")?.addEventListener("click", () => {
      if (mirror) mirror.value = "bachelors_degree";
      const display = doc.querySelector<HTMLElement>(".select__value-container");
      if (display) display.textContent = "Bachelor's Degree";
    });

    const fields = extractPageFields(doc);
    const degree = fields.find((item) => item.label === "Degree*");
    expect(degree).toBeTruthy();

    const records = await applyAutofillPlan({
      fields,
      plan: [
        {
          fieldId: degree!.fieldId,
          action: "select",
          value: "Bachelor's Degree",
          optionLabel: "Bachelor's Degree",
          confidence: 0.9,
          note: "Profile degree.",
        },
      ],
      getResume: async () => null,
    });

    expect(records[0]).toMatchObject({ status: "filled" });
    expect(mirror?.value).toBe("bachelors_degree");
  });

  it("sends all options for small meaningful lists", () => {
    const doc = installDom(`<!doctype html>
      <form>
        <label for="gov">Government official?</label>
        <select id="gov">
          <option>No, I am not a current or former Government Official</option>
          <option>Yes, I am a current Government Official</option>
          <option>Yes, I am a former Government Official</option>
        </select>
      </form>`);
    const field = extractPageFields(doc).find((item) => /government/i.test(item.label));
    expect(field).toBeTruthy();

    const compact = compactFields([field!], profile())[0];

    expect(compact.optionMode).toBe("full");
    expect(compact.optionCount).toBe(3);
    expect(compact.options).toEqual([
      "No, I am not a current or former Government Official",
      "Yes, I am a current Government Official",
      "Yes, I am a former Government Official",
    ]);
  });

  it("shrinks huge phone country-code dictionaries but keeps local matching hints", () => {
    const options = Array.from({ length: 80 }, (_, index) => `<option>Country ${index} +${index + 100}</option>`).join("");
    const doc = installDom(`<!doctype html>
      <form>
        <label for="phone-country">Phone country code</label>
        <select id="phone-country">
          ${options}
          <option>India +91</option>
        </select>
      </form>`);
    const field = extractPageFields(doc).find((item) => /phone country code/i.test(item.label));
    expect(field).toBeTruthy();
    expect(field!.options.length).toBeGreaterThan(30);

    const compact = compactFields([field!], profile())[0];

    expect(compact.optionMode).toBe("local_dictionary");
    expect(compact.optionDictionary).toBe("phone_country_code");
    expect(compact.optionCount).toBe(field!.options.length);
    expect(compact.options.length).toBeLessThan(field!.options.length);
    expect(compact.options).toContain("India +91");
  });

  it("sends ranked candidates for huge unknown lists", () => {
    const options = Array.from({ length: 80 }, (_, index) => `<option>Office ${index}</option>`).join("");
    const doc = installDom(`<!doctype html>
      <form>
        <label for="office">Preferred office</label>
        <select id="office">
          ${options}
          <option>Hyderabad</option>
        </select>
      </form>`);
    const field = extractPageFields(doc).find((item) => /preferred office/i.test(item.label));
    expect(field).toBeTruthy();

    const compact = compactFields([field!], profile())[0];

    expect(compact.optionMode).toBe("ranked_subset");
    expect(compact.optionDictionary).toBe("large_unknown");
    expect(compact.optionCount).toBe(field!.options.length);
    expect(compact.options.length).toBeLessThanOrEqual(16);
    expect(compact.options).toContain("Hyderabad");
  });
});
