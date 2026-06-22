import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import type { ExtensionFieldMapping, MasterProfile } from "@jobposted/shared";
import { workdayAdapter } from "../adapters/workday";
import { extractFields } from "./extract";
import { fillField } from "./fill";
import { resolveField } from "./resolve";
import { fillWorkAuthFallbacks } from "./work-auth-fallback";
import type { FieldDescriptor, FillContext } from "./types";

function installDomGlobals(window: unknown) {
  const w = window as {
    document: Document;
    Event: typeof Event;
    FocusEvent?: typeof FocusEvent;
    HTMLElement: typeof HTMLElement;
    HTMLInputElement: typeof HTMLInputElement;
    HTMLTextAreaElement: typeof HTMLTextAreaElement;
    HTMLSelectElement: typeof HTMLSelectElement;
    KeyboardEvent?: typeof KeyboardEvent;
    MouseEvent?: typeof MouseEvent;
    PointerEvent?: typeof PointerEvent;
  };
  Object.assign(globalThis, {
    window: w,
    document: w.document,
    Event: w.Event,
    FocusEvent: w.FocusEvent ?? w.Event,
    HTMLElement: w.HTMLElement,
    HTMLInputElement: w.HTMLInputElement,
    HTMLTextAreaElement: w.HTMLTextAreaElement,
    HTMLSelectElement: w.HTMLSelectElement,
    KeyboardEvent: w.KeyboardEvent ?? w.Event,
    MouseEvent: w.MouseEvent ?? w.Event,
    PointerEvent: w.PointerEvent,
  });
}

function fileField(required = true): FieldDescriptor {
  const { document, window } = parseHTML(`<input id="resume" type="file" ${required ? "required" : ""} />`);
  installDomGlobals(window);
  const element = document.querySelector("input") as HTMLInputElement;
  return {
    id: "resume",
    element,
    label: "Resume",
    context: "Resume",
    type: "file",
    required,
    options: [],
    signature: "resume:file",
  };
}

const mapping: ExtensionFieldMapping = {
  canonicalKey: "documents.resume",
  value: "https://example.com/resume.pdf",
  confidence: 0.96,
  source: "heuristic",
};

const context: FillContext = {
  profile: {
    identity: {
      firstName: "Theja",
      lastName: "Chitturi",
      email: "theja@example.com",
      phone: "+91 73300 07006",
    },
    location: { country: "India" },
    links: { website: [] },
    workAuth: { authorizedToWork: true, requiresSponsorship: false },
    experience: [],
    education: [],
    skills: [],
    answers: [],
    documents: {},
  } as MasterProfile,
  platform: "greenhouse",
  url: "https://boards.greenhouse.io/acme/jobs/1",
  overwrite: false,
  demographicsEnabled: false,
  getResume: async () => {
    throw new Error("resume fetch should not run");
  },
  onField: () => undefined,
  llmMap: async () => null,
};

describe("fillField file uploads", () => {
  it("leaves required resume uploads for the user", async () => {
    const record = await fillField(fileField(true), mapping, context);

    expect(record.status).toBe("needs_user");
    expect(record.error).toBe("Upload your resume manually.");
  });

  it("skips optional resume uploads without fetching a resume", async () => {
    const record = await fillField(fileField(false), mapping, context);

    expect(record.status).toBe("skipped");
    expect(record.error).toBe("Upload your resume manually.");
  });
});

describe("fillField phone normalization", () => {
  it("fills phone inputs with the national number without country code or leading trunk zero", async () => {
    const { document, window } = parseHTML(`<input id="phone" />`);
    installDomGlobals(window);
    const element = document.querySelector("input") as HTMLInputElement;
    const record = await fillField(
      {
        id: "phone",
        element,
        label: "Phone *",
        context: "Country * Phone *",
        type: "text",
        required: true,
        options: [],
        signature: "phone",
      },
      {
        canonicalKey: "identity.phone",
        value: context.profile.identity.phone,
        confidence: 0.96,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(element.value).toBe("7330007006");
    expect(record.valuePreview).toBe("7330007006");
  });

  it("skips an already-filled phone number instead of normalizing it", async () => {
    const { document, window } = parseHTML(`<input id="phone" value="073300 07006" />`);
    installDomGlobals(window);
    const element = document.querySelector("input") as HTMLInputElement;
    const record = await fillField(
      {
        id: "phone",
        element,
        label: "Phone *",
        context: "Country +91 Phone *",
        type: "text",
        required: true,
        options: [],
        signature: "phone",
      },
      {
        canonicalKey: "identity.phone",
        value: context.profile.identity.phone,
        confidence: 0.96,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("skipped");
    expect(record.error).toBe("Already filled.");
    expect(element.value).toBe("073300 07006");
    expect(record.valuePreview).toBe("7330007006");
  });

  it("selects the phone country code instead of filling the full phone number", async () => {
    const { document, window } = parseHTML(`
      <select id="country">
        <option value="">Select...</option>
        <option value="+93">Afghanistan +93</option>
        <option value="+1">United States +1</option>
        <option value="+91">India +91</option>
      </select>
    `);
    installDomGlobals(window);
    const element = document.querySelector("select") as HTMLSelectElement;
    const record = await fillField(
      {
        id: "country",
        element,
        label: "Country *",
        context: "Country * Phone *",
        type: "select",
        required: true,
        options: ["Select...", "Afghanistan +93", "United States +1", "India +91"],
        signature: "phone-country",
      },
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+91",
        confidence: 0.93,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(Array.from(element.options).find((option) => option.selected)?.value).toBe("+91");
    expect(record.valuePreview).toBe("+91");
  });

  it("infers the calling code from international phone digits even without a plus sign", async () => {
    const { document, window } = parseHTML(`
      <select id="country">
        <option value="">Select...</option>
        <option value="+1">United States +1</option>
        <option value="+91">India +91</option>
      </select>
    `);
    installDomGlobals(window);
    const element = document.querySelector("select") as HTMLSelectElement;
    const record = await fillField(
      {
        id: "country",
        element,
        label: "Country *",
        context: "Country * Phone *",
        type: "select",
        required: true,
        options: ["United States +1", "India +91"],
        signature: "phone-country",
      },
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+1",
        confidence: 0.93,
        source: "heuristic",
      },
      {
        ...context,
        profile: {
          ...context.profile,
          identity: { ...context.profile.identity, phone: "917330007006" },
          location: { ...context.profile.location, country: "United States" },
        },
      },
    );

    expect(record.status).toBe("filled");
    expect(Array.from(element.options).find((option) => option.selected)?.value).toBe("+91");
    expect(record.valuePreview).toBe("+91");
  });

  it("skips an already-selected phone country code instead of correcting it", async () => {
    const { document, window } = parseHTML(`
      <select id="country">
        <option value="+93" selected>Afghanistan +93</option>
        <option value="+91">India +91</option>
      </select>
    `);
    installDomGlobals(window);
    const element = document.querySelector("select") as HTMLSelectElement;
    const record = await fillField(
      {
        id: "country",
        element,
        label: "Country *",
        context: "Country * Phone *",
        type: "select",
        required: true,
        options: ["Afghanistan +93", "India +91"],
        signature: "phone-country",
      },
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+91",
        confidence: 0.93,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("skipped");
    expect(record.error).toBe("Already filled.");
    expect(Array.from(element.options).find((option) => option.selected)?.value).toBe("+93");
  });

  it("does not select the first custom phone country option when the exact code is missing", async () => {
    const { document, window } = parseHTML(`
      <button role="combobox" aria-controls="phone-countries">Select...</button>
      <ul id="phone-countries" role="listbox">
        <li role="option">Afghanistan +93</li>
        <li role="option">United States +1</li>
      </ul>
    `);
    installDomGlobals(window);
    const field = {
      id: "phone-country",
      element: document.querySelector("[role='combobox']") as HTMLElement,
      label: "Country *",
      context: "Country * Phone *",
      type: "combobox" as const,
      required: true,
      options: ["Afghanistan +93", "United States +1"],
      signature: "phone-country",
    };
    const record = await fillField(
      field,
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+91",
        confidence: 0.93,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("needs_user");
    expect(Array.from(document.querySelectorAll("[role='option']")).some((option) => option.getAttribute("aria-selected") === "true")).toBe(false);
  });

  it("never blind-commits a wrong phone country code via keyboard navigation", async () => {
    const { document, window } = parseHTML(`
      <button id="phone-country" role="combobox" aria-controls="phone-country-list">Select...</button>
      <ul id="phone-country-list" role="listbox">
        <li role="option" id="austria">Austria +43</li>
        <li role="option" id="belgium">Belgium +32</li>
      </ul>
    `);
    installDomGlobals(window);
    const button = document.getElementById("phone-country") as HTMLElement;
    // The widget commits whatever option is highlighted when Enter is pressed. The desired +91 is
    // not in the list, so a blind ArrowDown+Enter would wrongly land on Austria and leave it there
    // — exactly the "it set +43" bug. We must leave the control untouched instead.
    button.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") button.textContent = "Austria +43";
    });
    const record = await fillField(
      {
        id: "phone-country",
        element: button,
        label: "Country *",
        context: "Country * Phone *",
        type: "combobox",
        required: true,
        options: ["Austria +43", "Belgium +32"],
        signature: "phone-country",
      },
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+91",
        confidence: 0.93,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("needs_user");
    expect(button.textContent).toBe("Select...");
  });

  it("skips a custom phone country combobox that already has a value", async () => {
    const { document, window } = parseHTML(`
      <button role="combobox" aria-controls="phone-countries">Afghanistan +93</button>
      <ul id="phone-countries" role="listbox">
        <li role="option">Afghanistan +93</li>
        <li role="option">India +91</li>
      </ul>
    `);
    installDomGlobals(window);
    const button = document.querySelector("[role='combobox']") as HTMLElement;
    const india = Array.from(document.querySelectorAll("[role='option']")).at(1) as HTMLElement;
    india.addEventListener("mousedown", () => {
      button.textContent = india.textContent;
    });
    const field = {
      id: "phone-country",
      element: button,
      label: "Country *",
      context: "Phone *",
      type: "combobox" as const,
      required: true,
      options: ["Afghanistan +93", "India +91"],
      signature: "phone-country",
    };
    const record = await fillField(
      field,
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+91",
        confidence: 0.93,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("skipped");
    expect(record.error).toBe("Already filled.");
    expect(button.textContent).toBe("Afghanistan +93");
  });

  it("skips a phone-country combobox that was previously populated with phone digits", async () => {
    const { document, window } = parseHTML(`
      <button role="combobox" aria-controls="phone-countries">7330007006</button>
      <ul id="phone-countries" role="listbox">
        <li role="option">Afghanistan +93</li>
        <li role="option">India +91</li>
      </ul>
    `);
    installDomGlobals(window);
    const button = document.querySelector("[role='combobox']") as HTMLElement;
    const india = Array.from(document.querySelectorAll("[role='option']")).at(1) as HTMLElement;
    india.addEventListener("click", () => {
      button.textContent = india.textContent;
    });
    const record = await fillField(
      {
        id: "phone-country",
        element: button,
        label: "Country *",
        context: "Phone *",
        type: "combobox",
        required: true,
        options: ["Afghanistan +93", "India +91"],
        signature: "phone-country",
      },
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+91",
        confidence: 0.93,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("skipped");
    expect(record.error).toBe("Already filled.");
    expect(button.textContent).toBe("7330007006");
  });

  it("recovers a stale phone-number mapping for a phone country-code field", async () => {
    const { document, window } = parseHTML(`<input id="country-code" aria-label="Country" />`);
    installDomGlobals(window);
    const element = document.querySelector("input") as HTMLInputElement;
    const record = await fillField(
      {
        id: "country",
        element,
        label: "Country *",
        context: "Phone *",
        type: "text",
        required: true,
        options: [],
        signature: "country",
      },
      {
        canonicalKey: "identity.phone",
        value: "733007006",
        confidence: 0.96,
        source: "cache",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(record.canonicalKey).toBe("identity.phoneCountryCode");
    expect(element.value).toBe("+91");
  });

  it("refuses to write a phone number into an unrelated dropdown control", async () => {
    const { document, window } = parseHTML(`<button role="combobox" aria-label="Are you authorized to work?">Select...</button>`);
    installDomGlobals(window);
    const element = document.querySelector("button") as HTMLElement;
    const record = await fillField(
      {
        id: "auth",
        element,
        label: "Are you authorized to work?",
        context: "",
        type: "combobox",
        required: true,
        options: [],
        signature: "auth",
      },
      {
        canonicalKey: "identity.phone",
        value: "733007006",
        confidence: 0.96,
        source: "cache",
      },
      context,
    );

    expect(record.status).toBe("needs_user");
    expect(record.error).toContain("choice control");
    expect(element.textContent).toBe("Select...");
  });

  it("types the calling code into searchable custom phone country comboboxes", async () => {
    const { document, window } = parseHTML(`
      <button role="combobox" aria-controls="phone-countries">Select...</button>
      <ul id="phone-countries" role="listbox">
        <input role="textbox" />
      </ul>
    `);
    installDomGlobals(window);
    const button = document.querySelector("[role='combobox']") as HTMLElement;
    const search = document.querySelector("input") as HTMLInputElement;
    search.addEventListener("input", () => {
      if (document.querySelector("[role='option']")) return;
      const option = document.createElement("li");
      option.setAttribute("role", "option");
      option.textContent = "India +91";
      option.addEventListener("click", () => {
        button.textContent = option.textContent;
      });
      document.getElementById("phone-countries")?.append(option);
    });
    const field = {
      id: "phone-country",
      element: button,
      label: "Country *",
      context: "Phone *",
      type: "combobox" as const,
      required: true,
      options: [],
      signature: "phone-country",
    };
    const record = await fillField(
      field,
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+91",
        confidence: 0.93,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(search.value).toBe("+91");
    expect(button.textContent).toBe("India +91");
  });

  it("does not type location searches into an already-open phone country combobox", async () => {
    const { document, window } = parseHTML(`
      <div>
        <button id="country" role="combobox" aria-controls="country-options">+91</button>
        <div id="country-options" role="listbox">
          <input id="country-search" role="textbox" />
        </div>
        <button id="city" role="combobox" aria-controls="city-options">Select...</button>
        <div id="city-options" role="listbox">
          <input id="city-search" role="textbox" />
        </div>
      </div>
    `);
    installDomGlobals(window);
    const cityButton = document.getElementById("city") as HTMLElement;
    const citySearch = document.getElementById("city-search") as HTMLInputElement;
    const countrySearch = document.getElementById("country-search") as HTMLInputElement;
    citySearch.addEventListener("input", () => {
      if (document.querySelector("#city-options [role='option']")) return;
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = "Hyderabad, Telangana, India";
      option.addEventListener("click", () => {
        cityButton.textContent = option.textContent;
      });
      document.getElementById("city-options")?.append(option);
    });
    const record = await fillField(
      {
        id: "city",
        element: cityButton,
        label: "Location (City) *",
        context: "",
        type: "combobox",
        required: true,
        options: [],
        signature: "city",
      },
      {
        canonicalKey: "location.city",
        value: "Hyderabad",
        confidence: 0.88,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(citySearch.value).toBe("Hyderabad");
    expect(cityButton.textContent).toBe("Hyderabad, Telangana, India");
    expect(countrySearch.value).toBe("");
    expect(document.getElementById("country")?.textContent).toBe("+91");
  });

  it("does not write a reusable answer when the value is the question prompt", async () => {
    const { document, window } = parseHTML(`<input />`);
    installDomGlobals(window);
    const prompt = "How did you hear about this job?";
    const element = document.querySelector("input") as HTMLInputElement;
    const record = await fillField(
      {
        id: "source",
        element,
        label: prompt,
        context: "",
        type: "text",
        required: true,
        options: [],
        signature: "source",
      },
      {
        canonicalKey: "answers.referral-source",
        value: prompt,
        confidence: 0.9,
        source: "answer",
      },
      context,
    );

    expect(record.status).toBe("needs_user");
    expect(element.value).toBe("");
    expect(record.error).toBe("Saved answer matches the question.");
  });
});

describe("fillField Workday dropdown variants", () => {
  it("selects direct Workday listbox dropdowns", async () => {
    const { document, window } = parseHTML(`
      <form data-automation-id="workdayApplication">
        <div data-automation-id="authorizedToWork">
          <label>Are you legally authorized to work?</label>
          <button id="auth" type="button" aria-haspopup="listbox" aria-controls="auth-options">Select One</button>
          <div id="auth-options" role="listbox">
            <div role="option" id="auth-yes">Yes</div>
            <div role="option">No</div>
          </div>
        </div>
      </form>
    `);
    installDomGlobals(window);
    const button = document.getElementById("auth") as HTMLElement;
    document.getElementById("auth-yes")?.addEventListener("mousedown", () => {
      button.textContent = "Yes";
    });
    const field = extractFields(document, "workday", workdayAdapter.mapFields(document))[0]!;
    const mapping = await resolveField({
      field,
      profile: context.profile,
      platform: "workday",
      url: "https://acme.myworkdayjobs.com/job/apply",
      demographicsEnabled: false,
    });
    const record = await fillField(field, mapping, { ...context, platform: "workday" });

    expect(field.type).toBe("combobox");
    expect(mapping.canonicalKey).toBe("workAuth.authorizedToWork");
    expect(record.status).toBe("filled");
    expect(button.textContent).toBe("Yes");
  });

  it("submits searchable Workday dropdowns that render options after Enter", async () => {
    const { document, window } = parseHTML(`
      <form data-automation-id="workdayApplication">
        <div data-automation-id="country">
          <label for="country-input">Country</label>
          <input id="country-input" aria-autocomplete="list" aria-controls="country-options" />
          <div id="country-options" role="listbox"></div>
        </div>
      </form>
    `);
    installDomGlobals(window);
    const input = document.getElementById("country-input") as HTMLInputElement;
    const listbox = document.getElementById("country-options") as HTMLElement;
    let enterSearches = 0;
    input.addEventListener("keydown", () => {
      if (document.getElementById("country-us")) return;
      enterSearches += 1;
      const option = document.createElement("div");
      option.id = "country-us";
      option.setAttribute("role", "option");
      option.textContent = "United States";
      option.addEventListener("mousedown", () => {
        input.value = "United States";
      });
      listbox.append(option);
    });
    const workdayProfile: MasterProfile = {
      ...context.profile,
      location: { ...context.profile.location, country: "United States" },
    };
    const field = extractFields(document, "workday", workdayAdapter.mapFields(document))[0]!;
    const mapping = await resolveField({
      field,
      profile: workdayProfile,
      platform: "workday",
      url: "https://acme.myworkdayjobs.com/job/apply",
      demographicsEnabled: false,
    });
    const record = await fillField(field, mapping, { ...context, platform: "workday", profile: workdayProfile });

    expect(field.type).toBe("combobox");
    expect(mapping.canonicalKey).toBe("location.country");
    expect(record.status).toBe("filled");
    expect(enterSearches).toBe(1);
    expect(input.value).toBe("United States");
  });
});

describe("fillField custom choice controls", () => {
  it("skips already-checked checkboxes even when overwrite is enabled", async () => {
    const { document, window } = parseHTML(`
      <label><input id="none" type="checkbox" checked /> None of the above</label>
    `);
    installDomGlobals(window);
    const input = document.getElementById("none") as HTMLInputElement;
    const record = await fillField(
      {
        id: "none",
        element: input,
        label: "None of the above",
        context: "Please confirm whether any applies to you for U.S. sanctions and export controls.",
        type: "checkbox",
        required: true,
        options: [],
        signature: "none",
      },
      {
        canonicalKey: "answers.screening.compliance_none_of_above",
        value: false,
        confidence: 0.88,
        source: "heuristic",
      },
      { ...context, overwrite: true },
    );

    expect(record.status).toBe("skipped");
    expect(record.error).toBe("Already filled.");
    expect(input.hasAttribute("checked")).toBe(true);
  });

  it("checks native neutral compliance checkboxes", async () => {
    const { document, window } = parseHTML(`
      <label><input id="none" type="checkbox" /> None of the above</label>
    `);
    installDomGlobals(window);
    const input = document.getElementById("none") as HTMLInputElement;
    const record = await fillField(
      {
        id: "none",
        element: input,
        label: "None of the above",
        context: "Please confirm whether any applies to you for U.S. sanctions and export controls.",
        type: "checkbox",
        required: true,
        options: [],
        signature: "none",
      },
      {
        canonicalKey: "answers.screening.compliance_none_of_above",
        value: true,
        confidence: 0.88,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(input.checked).toBe(true);
  });

  it("skips already-selected native radio groups", async () => {
    const { document, window } = parseHTML(`
      <fieldset>
        <legend>Are you legally authorized to work?</legend>
        <label><input type="radio" name="auth" value="yes" /> Yes</label>
        <label><input type="radio" name="auth" value="no" checked /> No</label>
      </fieldset>
    `);
    installDomGlobals(window);
    const field = extractFields(document, "greenhouse")[0]!;
    const yes = document.querySelector("input[value='yes']") as HTMLInputElement;
    const no = document.querySelector("input[value='no']") as HTMLInputElement;
    const record = await fillField(
      field,
      {
        canonicalKey: "workAuth.authorizedToWork",
        value: true,
        confidence: 0.94,
        source: "heuristic",
      },
      { ...context, overwrite: true },
    );

    expect(record.status).toBe("skipped");
    expect(record.error).toBe("Already filled.");
    expect(yes.hasAttribute("checked")).toBe(false);
    expect(no.hasAttribute("checked")).toBe(true);
  });

  it("skips already-selected button choice groups", async () => {
    const { document, window } = parseHTML(`
      <div>
        <p>Do you now or will you in the future need sponsorship?</p>
        <button type="button" aria-pressed="false">Yes</button>
        <button type="button" aria-pressed="true">No</button>
      </div>
    `);
    installDomGlobals(window);
    const field = extractFields(document, "greenhouse")[0]!;
    const buttons = Array.from(document.querySelectorAll("button"));
    const record = await fillField(
      field,
      {
        canonicalKey: "workAuth.requiresSponsorship",
        value: true,
        confidence: 0.92,
        source: "heuristic",
      },
      { ...context, overwrite: true },
    );

    expect(record.status).toBe("skipped");
    expect(record.error).toBe("Already filled.");
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("selects portal-rendered custom dropdown options when the controlled root is empty", async () => {
    const { document, window } = parseHTML(`
      <button id="auth" role="combobox" aria-controls="empty-auth-options">Select...</button>
      <div id="empty-auth-options" role="listbox"></div>
      <div role="listbox" id="portal-auth-options">
        <div role="option" id="auth-no">No</div>
        <div role="option" id="auth-yes">Yes</div>
      </div>
    `);
    installDomGlobals(window);
    const button = document.getElementById("auth") as HTMLElement;
    document.getElementById("auth-yes")?.addEventListener("click", () => {
      button.textContent = "Yes";
    });
    const record = await fillField(
      {
        id: "auth",
        element: button,
        label: "Are you legally authorized to work in the country in which you are applying? *",
        context: "",
        type: "combobox",
        required: true,
        options: [],
        signature: "auth",
      },
      {
        canonicalKey: "workAuth.authorizedToWork",
        value: true,
        confidence: 0.9,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(button.textContent).toBe("Yes");
  });

  it("waits for delayed portal-rendered yes/no dropdown options", async () => {
    const { document, window } = parseHTML(`
      <button id="sponsor" role="combobox" aria-controls="empty-sponsor-options">Select...</button>
      <div id="empty-sponsor-options" role="listbox"></div>
      <div id="portal-root"></div>
    `);
    installDomGlobals(window);
    const button = document.getElementById("sponsor") as HTMLElement;
    button.addEventListener("click", () => {
      window.setTimeout(() => {
        if (document.getElementById("sponsor-no")) return;
        const listbox = document.createElement("div");
        listbox.setAttribute("role", "listbox");
        const yes = document.createElement("div");
        yes.setAttribute("role", "option");
        yes.textContent = "Yes";
        const no = document.createElement("div");
        no.id = "sponsor-no";
        no.setAttribute("role", "option");
        no.textContent = "No";
        no.addEventListener("click", () => {
          button.textContent = "No";
        });
        listbox.append(yes, no);
        document.getElementById("portal-root")?.append(listbox);
      }, 260);
    });
    const record = await fillField(
      {
        id: "sponsor",
        element: button,
        label: "Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying? *",
        context: "",
        type: "combobox",
        required: true,
        options: [],
        signature: "sponsor",
      },
      {
        canonicalKey: "workAuth.requiresSponsorship",
        value: false,
        confidence: 0.92,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(button.textContent).toBe("No");
  });

  it("does not treat question text plus Select placeholder as an already-filled dropdown", async () => {
    const { document, window } = parseHTML(`
      <button id="previous" role="combobox" aria-controls="empty-previous-options">
        Do you currently or have you previously worked for Databricks in the past? Select...
      </button>
      <div id="empty-previous-options" role="listbox"></div>
      <div id="portal-root"></div>
    `);
    installDomGlobals(window);
    const button = document.getElementById("previous") as HTMLElement;
    button.addEventListener("click", () => {
      if (document.getElementById("previous-no")) return;
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      const yes = document.createElement("div");
      yes.setAttribute("role", "option");
      yes.textContent = "Yes";
      const no = document.createElement("div");
      no.id = "previous-no";
      no.setAttribute("role", "option");
      no.textContent = "No";
      no.addEventListener("click", () => {
        button.textContent = "Do you currently or have you previously worked for Databricks in the past? No";
      });
      listbox.append(yes, no);
      document.getElementById("portal-root")?.append(listbox);
    });

    const record = await fillField(
      {
        id: "previous",
        element: button,
        label: "Do you currently or have you previously worked for Databricks in the past? *",
        context: "",
        type: "combobox",
        required: true,
        options: [],
        signature: "previous",
      },
      {
        canonicalKey: "answers.screening.previous_company_employment",
        value: "No",
        confidence: 0.84,
        source: "answer",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(button.textContent).toContain("No");
  });

  it("does not skip closed setup dropdowns when the extracted label misses the visible question", async () => {
    const { document, window } = parseHTML(`
      <button id="auth" role="combobox" aria-controls="auth-options">
        Are you legally authorized to work in the country in which you are applying? Select...
      </button>
      <div id="auth-options" role="listbox">
        <div role="option" id="auth-yes">Yes</div>
        <div role="option">No</div>
      </div>
    `);
    installDomGlobals(window);
    const button = document.getElementById("auth") as HTMLElement;
    document.getElementById("auth-yes")?.addEventListener("mousedown", () => {
      button.textContent = "Are you legally authorized to work in the country in which you are applying? Yes";
    });

    const record = await fillField(
      {
        id: "auth",
        element: button,
        label: "auth-select",
        context: "",
        type: "combobox",
        required: true,
        options: ["Yes", "No"],
        signature: "auth",
      },
      {
        canonicalKey: "workAuth.authorizedToWork",
        value: true,
        confidence: 0.9,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(button.textContent).toContain("Yes");
  });

  it("commits options for dropdowns that listen on mousedown instead of click", async () => {
    const { document, window } = parseHTML(`
      <button id="auth" role="combobox" aria-controls="auth-options">Select...</button>
      <div id="auth-options" role="listbox">
        <div role="option" id="auth-yes">Yes</div>
        <div role="option" id="auth-no">No</div>
      </div>
    `);
    installDomGlobals(window);
    const button = document.getElementById("auth") as HTMLElement;
    document.getElementById("auth-no")?.addEventListener("mousedown", () => {
      button.textContent = "No";
    });

    const record = await fillField(
      {
        id: "auth",
        element: button,
        label: "Are you legally authorized to work in the country in which you are applying? *",
        context: "",
        type: "combobox",
        required: true,
        options: ["Yes", "No"],
        signature: "auth",
      },
      {
        canonicalKey: "workAuth.requiresSponsorship",
        value: false,
        confidence: 0.92,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(button.textContent).toBe("No");
  });

  it("ignores stale portal options from a previously-open dropdown", async () => {
    const { document, window } = parseHTML(`
      <button id="auth" role="combobox" aria-controls="auth-options">Select...</button>
      <div id="auth-options" role="listbox"></div>
      <div role="listbox" id="stale-auth-options">
        <div role="option" id="stale-auth-no">No</div>
        <div role="option" id="stale-auth-yes">Yes</div>
      </div>

      <button id="sponsor" role="combobox" aria-controls="sponsor-options">Select...</button>
      <div id="sponsor-options" role="listbox"></div>
      <div id="portal-root"></div>
    `);
    installDomGlobals(window);
    const authButton = document.getElementById("auth") as HTMLElement;
    const sponsorButton = document.getElementById("sponsor") as HTMLElement;
    document.getElementById("stale-auth-no")?.addEventListener("mousedown", () => {
      authButton.textContent = "No";
    });
    sponsorButton.addEventListener("mousedown", () => {
      if (document.getElementById("fresh-sponsor-no")) return;
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      const yes = document.createElement("div");
      yes.setAttribute("role", "option");
      yes.textContent = "Yes";
      const no = document.createElement("div");
      no.id = "fresh-sponsor-no";
      no.setAttribute("role", "option");
      no.textContent = "No";
      no.addEventListener("mousedown", () => {
        sponsorButton.textContent = "No";
      });
      listbox.append(yes, no);
      document.getElementById("portal-root")?.append(listbox);
    });

    const record = await fillField(
      {
        id: "sponsor",
        element: sponsorButton,
        label: "Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying? *",
        context: "",
        type: "combobox",
        required: true,
        options: [],
        signature: "sponsor",
      },
      {
        canonicalKey: "workAuth.requiresSponsorship",
        value: false,
        confidence: 0.92,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(sponsorButton.textContent).toBe("No");
    expect(authButton.textContent).toBe("Select...");
  });

  it("ignores yes/no options inside hidden closed dropdown menus", async () => {
    const { document, window } = parseHTML(`
      <button id="sponsor" role="combobox" aria-controls="sponsor-options">Select...</button>
      <div id="sponsor-options" role="listbox"></div>
      <div id="closed-auth-options" role="listbox">
        <div role="option" id="hidden-no">No</div>
        <div role="option">Yes</div>
      </div>
      <div id="portal-root"></div>
    `);
    installDomGlobals(window);
    const styledWindow = window as unknown as {
      getComputedStyle?: (element: Element) => Pick<CSSStyleDeclaration, "display" | "visibility">;
    };
    const previousGetComputedStyle = styledWindow.getComputedStyle;
    styledWindow.getComputedStyle = (element) => ({
      display: element.id === "closed-auth-options" ? "none" : "block",
      visibility: "visible",
    });
    const visibleRect = {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 120,
      bottom: 24,
      width: 120,
      height: 24,
      toJSON: () => ({}),
    } as DOMRect;
    const button = document.getElementById("sponsor") as HTMLElement;
    document.getElementById("hidden-no")?.addEventListener("mousedown", () => {
      button.textContent = "Hidden No";
    });
    button.addEventListener("mousedown", () => {
      if (document.getElementById("fresh-no")) return;
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      const yes = document.createElement("div");
      yes.setAttribute("role", "option");
      yes.textContent = "Yes";
      yes.getBoundingClientRect = () => visibleRect;
      const no = document.createElement("div");
      no.id = "fresh-no";
      no.setAttribute("role", "option");
      no.textContent = "No";
      no.getBoundingClientRect = () => visibleRect;
      no.addEventListener("mousedown", () => {
        button.textContent = "No";
      });
      listbox.append(yes, no);
      document.getElementById("portal-root")?.append(listbox);
    });

    const record = await fillField(
      {
        id: "sponsor",
        element: button,
        label: "Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying? *",
        context: "",
        type: "combobox",
        required: true,
        options: [],
        signature: "sponsor",
      },
      {
        canonicalKey: "workAuth.requiresSponsorship",
        value: false,
        confidence: 0.92,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(button.textContent).toBe("No");
    if (previousGetComputedStyle) {
      styledWindow.getComputedStyle = previousGetComputedStyle;
    } else {
      delete styledWindow.getComputedStyle;
    }
  });

  it("fills embedded Greenhouse work-auth dropdowns in the fallback pass", async () => {
    const { document, window } = parseHTML(`
      <form>
        <div class="field" id="auth-field">
          <div class="field-heading">Are you legally authorized to work in the country in which you are applying? *</div>
          <button id="auth" role="combobox" aria-controls="auth-options">Select...</button>
          <div id="auth-options" role="listbox"></div>
        </div>
        <div class="field" id="sponsor-field">
          <div class="field-heading">Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying? *</div>
          <button id="sponsor" role="combobox" aria-controls="sponsor-options">Select...</button>
          <div id="sponsor-options" role="listbox"></div>
        </div>
        <div id="portal-root"></div>
      </form>
    `);
    installDomGlobals(window);
    const auth = document.getElementById("auth") as HTMLElement;
    const sponsor = document.getElementById("sponsor") as HTMLElement;
    auth.addEventListener("mousedown", () => {
      if (document.getElementById("auth-yes")) return;
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      const yes = document.createElement("div");
      yes.id = "auth-yes";
      yes.setAttribute("role", "option");
      yes.textContent = "Yes";
      yes.addEventListener("mousedown", () => {
        auth.textContent = "Yes";
      });
      const no = document.createElement("div");
      no.setAttribute("role", "option");
      no.textContent = "No";
      listbox.append(yes, no);
      document.getElementById("portal-root")?.append(listbox);
    });
    sponsor.addEventListener("mousedown", () => {
      if (document.getElementById("sponsor-no")) return;
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      const yes = document.createElement("div");
      yes.setAttribute("role", "option");
      yes.textContent = "Yes";
      const no = document.createElement("div");
      no.id = "sponsor-no";
      no.setAttribute("role", "option");
      no.textContent = "No";
      no.addEventListener("mousedown", () => {
        sponsor.textContent = "No";
      });
      listbox.append(yes, no);
      document.getElementById("portal-root")?.append(listbox);
    });

    const records = await fillWorkAuthFallbacks({
      profile: context.profile,
      platform: "greenhouse",
      url: "https://www.databricks.com/company/careers/engineering/role?gh_jid=123",
      demographicsEnabled: false,
      context,
      existingRecords: [],
    });

    expect(records.map((record) => record.status)).toEqual(["filled", "filled"]);
    expect(auth.textContent).toBe("Yes");
    expect(sponsor.textContent).toBe("No");
  });

  it("selects phone country codes from a portal opened after an empty controlled root", async () => {
    const { document, window } = parseHTML(`
      <button id="phone-country" role="combobox" aria-controls="empty-country-options">Country Select...</button>
      <div id="empty-country-options" role="listbox"></div>
      <div role="listbox" id="stale-options">
        <div role="option" id="stale-india">India +91</div>
      </div>
      <div id="portal-root"></div>
    `);
    installDomGlobals(window);
    const button = document.getElementById("phone-country") as HTMLElement;
    button.addEventListener("click", () => {
      if (document.getElementById("fresh-india")) return;
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      const afghanistan = document.createElement("div");
      afghanistan.setAttribute("role", "option");
      afghanistan.textContent = "Afghanistan +93";
      const india = document.createElement("div");
      india.id = "fresh-india";
      india.setAttribute("role", "option");
      india.textContent = "India +91";
      india.addEventListener("click", () => {
        button.textContent = "India +91";
      });
      listbox.append(afghanistan, india);
      document.getElementById("portal-root")?.append(listbox);
    });

    const record = await fillField(
      {
        id: "phone-country",
        element: button,
        label: "Country *",
        context: "Phone *",
        type: "combobox",
        required: true,
        options: [],
        signature: "phone-country",
      },
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+91",
        confidence: 0.93,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(button.textContent).toBe("India +91");
    expect(document.getElementById("stale-india")?.getAttribute("aria-selected")).toBeNull();
  });

  it("does not claim a dropdown was filled when keyboard selection leaves the visible value unchanged", async () => {
    const { document, window } = parseHTML(`
      <button id="auth" role="combobox" aria-controls="empty-auth-options">Select...</button>
      <div id="empty-auth-options" role="listbox"></div>
    `);
    installDomGlobals(window);
    const record = await fillField(
      {
        id: "auth",
        element: document.getElementById("auth") as HTMLElement,
        label: "Are you legally authorized to work in the country in which you are applying? *",
        context: "",
        type: "combobox",
        required: true,
        options: [],
        signature: "auth",
      },
      {
        canonicalKey: "workAuth.authorizedToWork",
        value: true,
        confidence: 0.9,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("needs_user");
    expect(record.error).toBe("No matching option.");
    expect(document.getElementById("auth")?.textContent).toBe("Select...");
  });

  it("keeps phone-country dropdowns from using unrelated portal options", async () => {
    const { document, window } = parseHTML(`
      <button id="phone-country" role="combobox" aria-controls="empty-country-options">Select...</button>
      <div id="empty-country-options" role="listbox"></div>
      <div role="listbox" id="unrelated-options">
        <div role="option" id="india">India +91</div>
      </div>
    `);
    installDomGlobals(window);
    const record = await fillField(
      {
        id: "phone-country",
        element: document.getElementById("phone-country") as HTMLElement,
        label: "Country *",
        context: "Phone *",
        type: "combobox",
        required: true,
        options: [],
        signature: "phone-country",
      },
      {
        canonicalKey: "identity.phoneCountryCode",
        value: "+91",
        confidence: 0.93,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("needs_user");
    expect(document.getElementById("india")?.getAttribute("aria-selected")).toBeNull();
  });

  it("selects custom radio-button groups", async () => {
    const { document, window } = parseHTML(`
      <div role="radiogroup" aria-label="Are you legally authorized to work in the country in which you are applying?">
        <div role="radio" aria-checked="false" aria-label="Yes"></div>
        <div role="radio" aria-checked="false" aria-label="No"></div>
      </div>
    `);
    installDomGlobals(window);
    const field = extractFields(document, "greenhouse")[0]!;
    const record = await fillField(
      field,
      {
        canonicalKey: "workAuth.authorizedToWork",
        value: true,
        confidence: 0.94,
        source: "heuristic",
      },
      context,
    );

    expect(field.type).toBe("radio");
    expect(field.options).toEqual(["Yes", "No"]);
    expect(record.status).toBe("filled");
    expect(document.querySelector("[aria-label='Yes']")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("[aria-label='No']")?.getAttribute("aria-checked")).toBe("false");
  });

  it("selects custom dropdown options from controlled listboxes", async () => {
    const { document, window } = parseHTML(`
      <div>
        <label id="source-label">How did you hear about this job?</label>
        <button id="source" role="combobox" aria-labelledby="source-label source-value" aria-controls="source-options">
          <span id="source-value">Select...</span>
        </button>
        <ul id="source-options" role="listbox">
          <li role="option">Company website</li>
          <li role="option">Employee referral</li>
        </ul>
      </div>
    `);
    installDomGlobals(window);
    const button = document.getElementById("source") as HTMLElement;
    const option = Array.from(document.querySelectorAll("[role='option']")).at(1) as HTMLElement;
    option.addEventListener("mousedown", () => {
      document.getElementById("source-value")!.textContent = option.textContent;
    });
    const field = extractFields(document, "greenhouse")[0]!;
    const record = await fillField(
      field,
      {
        canonicalKey: "answers.custom_source_choice",
        value: "Employee referral",
        confidence: 0.9,
        source: "answer",
      },
      context,
    );

    expect(field.type).toBe("combobox");
    expect(field.options).toEqual(["Company website", "Employee referral"]);
    expect(record.status).toBe("filled");
    expect(button.textContent).toContain("Employee referral");
  });

  it("prefers LinkedIn for referral source dropdowns", async () => {
    const { document, window } = parseHTML(`
      <div>
        <label id="source-label">How did you hear about this job?</label>
        <button id="source" role="combobox" aria-labelledby="source-label source-value" aria-controls="source-options">
          <span id="source-value">Select...</span>
        </button>
        <ul id="source-options" role="listbox">
          <li role="option">Company website</li>
          <li role="option">Job board</li>
          <li role="option">LinkedIn</li>
        </ul>
      </div>
    `);
    installDomGlobals(window);
    const button = document.getElementById("source") as HTMLElement;
    for (const option of Array.from(document.querySelectorAll<HTMLElement>("[role='option']"))) {
      option.addEventListener("mousedown", () => {
        document.getElementById("source-value")!.textContent = option.textContent;
      });
    }
    const field = extractFields(document, "greenhouse")[0]!;
    const record = await fillField(
      field,
      {
        canonicalKey: "answers.referral_source",
        value: "LinkedIn",
        confidence: 0.78,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(button.textContent).toContain("LinkedIn");
  });

  it("falls back to job board for referral source selects when LinkedIn is absent", async () => {
    const { document, window } = parseHTML(`
      <select id="source">
        <option value="">Select...</option>
        <option value="company">Company website</option>
        <option value="board">Job board</option>
        <option value="referral">Employee referral</option>
      </select>
    `);
    installDomGlobals(window);
    const select = document.getElementById("source") as HTMLSelectElement;
    const record = await fillField(
      {
        id: "source",
        element: select,
        label: "How did you hear about us?",
        context: "",
        type: "select",
        required: true,
        options: ["Select...", "Company website", "Job board", "Employee referral"],
        signature: "source",
      },
      {
        canonicalKey: "answers.referral_source",
        value: "LinkedIn",
        confidence: 0.78,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(select.value).toBe("board");
  });

  it("uses the first real referral source option when no preferred source exists", async () => {
    const { document, window } = parseHTML(`
      <select id="source">
        <option value="">Please select</option>
        <option value="company">Company website</option>
        <option value="referral">Employee referral</option>
      </select>
    `);
    installDomGlobals(window);
    const select = document.getElementById("source") as HTMLSelectElement;
    const record = await fillField(
      {
        id: "source",
        element: select,
        label: "How did you hear about this job?",
        context: "",
        type: "select",
        required: true,
        options: ["Please select", "Company website", "Employee referral"],
        signature: "source",
      },
      {
        canonicalKey: "answers.referral_source",
        value: "LinkedIn",
        confidence: 0.78,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(select.value).toBe("company");
  });

  it("extracts Greenhouse React select wrappers instead of their internal search input", async () => {
    const { document, window } = parseHTML(`
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
    `);
    installDomGlobals(window);
    const select = document.getElementById("auth-select") as HTMLElement;
    const control = document.getElementById("auth-control") as HTMLElement;
    control.addEventListener("mouseup", () => {
      if (document.getElementById("auth-option-yes")) return;
      const menu = document.createElement("div");
      menu.className = "select__menu";
      const yes = document.createElement("div");
      yes.id = "auth-option-yes";
      yes.className = "select__option";
      yes.textContent = "Yes";
      const no = document.createElement("div");
      no.className = "select__option";
      no.textContent = "No";
      yes.addEventListener("mousedown", () => {
        const selected = document.createElement("div");
        selected.className = "select__single-value";
        selected.textContent = "Yes";
        select.append(selected);
      });
      menu.append(yes, no);
      document.getElementById("portal-root")?.append(menu);
    });

    const fields = extractFields(document, "greenhouse");
    const field = fields[0]!;
    const record = await fillField(
      field,
      {
        canonicalKey: "workAuth.authorizedToWork",
        value: true,
        confidence: 0.9,
        source: "heuristic",
      },
      context,
    );

    expect(fields).toHaveLength(1);
    expect(field.element).toBe(select);
    expect(field.type).toBe("combobox");
    expect(field.label).toBe("Are you legally authorized to work in the country in which you are applying? *");
    expect(record.status).toBe("filled");
    expect(select.textContent).toContain("Yes");
    expect((document.querySelector(".select__input") as HTMLInputElement).value).toBe("");
  });

  it("fills Greenhouse Select2 dropdown shells by opening the visible trigger", async () => {
    const { document, window } = parseHTML(`
      <div id="sponsor-field" class="field">
        <label>Do you now or will you in the future need sponsorship for employment visa status? *</label>
        <select>
          <option>Select...</option>
          <option>Yes</option>
          <option>No</option>
        </select>
        <div class="select2-container">
          <a id="sponsor-trigger" href="#"><span class="select2-chosen">Select...</span></a>
        </div>
      </div>
      <div id="portal-root"></div>
    `);
    installDomGlobals(window);
    const fieldRoot = document.getElementById("sponsor-field") as HTMLElement;
    const trigger = document.getElementById("sponsor-trigger") as HTMLElement;
    const chosen = document.querySelector(".select2-chosen") as HTMLElement;
    trigger.addEventListener("mousedown", () => {
      if (document.getElementById("sponsor-option-no")) return;
      const dropdown = document.createElement("div");
      dropdown.className = "select2-drop-active";
      const list = document.createElement("ul");
      const yes = document.createElement("li");
      yes.textContent = "Yes";
      const no = document.createElement("li");
      no.id = "sponsor-option-no";
      no.textContent = "No";
      no.addEventListener("mouseup", () => {
        chosen.textContent = "No";
      });
      list.append(yes, no);
      dropdown.append(list);
      document.getElementById("portal-root")?.append(dropdown);
    });

    const fields = extractFields(document, "greenhouse");
    const field = fields[0]!;
    const record = await fillField(
      field,
      {
        canonicalKey: "workAuth.requiresSponsorship",
        value: false,
        confidence: 0.92,
        source: "heuristic",
      },
      context,
    );

    expect(fields).toHaveLength(1);
    expect(field.element).toBe(fieldRoot);
    expect(field.type).toBe("combobox");
    expect(field.options).toEqual(["Yes", "No"]);
    expect(record.status).toBe("filled");
    expect(chosen.textContent).toBe("No");
  });

  it("falls back to nested text inputs for editable custom dropdowns", async () => {
    const { document, window } = parseHTML(`
      <div>
        <label id="source-label">How did you hear about this job?</label>
        <div role="combobox" aria-labelledby="source-label">
          <input />
        </div>
      </div>
    `);
    installDomGlobals(window);
    const field = extractFields(document, "greenhouse")[0]!;
    const input = document.querySelector("input") as HTMLInputElement;
    const record = await fillField(
      field,
      {
        canonicalKey: "answers.referral-source",
        value: "Employee referral",
        confidence: 0.9,
        source: "answer",
      },
      context,
    );

    expect(field.type).toBe("combobox");
    expect(record.status).toBe("filled");
    expect(input.value).toBe("Employee referral");
  });

  it("selects Ashby-style Yes/No button groups by clicking the matching button", async () => {
    const { document, window } = parseHTML(`
      <div class="field">
        <div class="label">Will you now or in the future require sponsorship to work in the US? *</div>
        <div class="options">
          <button type="button" id="yes">Yes</button>
          <button type="button" id="no">No</button>
        </div>
      </div>
    `);
    installDomGlobals(window);
    const options = document.querySelector(".options") as HTMLElement;
    let clicked = "";
    document.getElementById("yes")?.addEventListener("click", () => {
      clicked = "Yes";
    });
    document.getElementById("no")?.addEventListener("click", () => {
      clicked = "No";
    });
    const record = await fillField(
      {
        id: "sponsor",
        element: options,
        label: "Will you now or in the future require sponsorship to work in the US? *",
        context: "",
        type: "radio",
        required: true,
        options: ["Yes", "No"],
        signature: "sponsor",
      },
      {
        canonicalKey: "workAuth.requiresSponsorship",
        value: false,
        confidence: 0.92,
        source: "heuristic",
      },
      context,
    );

    expect(record.status).toBe("filled");
    expect(clicked).toBe("No");
  });

  it("does not click submit/upload action buttons as if they were options", async () => {
    const { document, window } = parseHTML(`
      <div class="actions">
        <button type="button" id="upload">Upload file</button>
        <button type="submit" id="submit">Submit Application</button>
      </div>
    `);
    installDomGlobals(window);
    const actions = document.querySelector(".actions") as HTMLElement;
    let clicked = "";
    document.getElementById("upload")?.addEventListener("click", () => {
      clicked = "upload";
    });
    document.getElementById("submit")?.addEventListener("click", () => {
      clicked = "submit";
    });
    const record = await fillField(
      {
        id: "action-row",
        element: actions,
        label: "Will you now or in the future require sponsorship to work in the US? *",
        context: "",
        type: "radio",
        required: true,
        options: ["Upload file", "Submit Application"],
        signature: "action-row",
      },
      {
        canonicalKey: "workAuth.requiresSponsorship",
        value: false,
        confidence: 0.92,
        source: "heuristic",
      },
      context,
    );

    expect(clicked).toBe("");
    expect(record.status).toBe("needs_user");
  });
});
