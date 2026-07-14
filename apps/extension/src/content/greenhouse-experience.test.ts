import type { MasterProfile } from "@jobposted/shared";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { extractPageFields, hydrateChoiceFieldOptions } from "./autofill";
import { createGreenhouseFillStrategy } from "./open-ats";

const fixtures = import.meta.glob("../fixtures/*.html", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function installDom(html: string) {
  const { document, window } = parseHTML(html);
  Object.assign(globalThis, {
    window,
    document,
    Event: window.Event,
    FocusEvent: window.FocusEvent ?? window.Event,
    KeyboardEvent: window.KeyboardEvent ?? window.Event,
    MouseEvent: window.MouseEvent ?? window.Event,
    PointerEvent: window.PointerEvent ?? window.Event,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLOptionElement: window.HTMLOptionElement,
  });
  Object.defineProperty(window, "location", {
    value: new URL("https://job-boards.greenhouse.io/embed/job_app?for=coinbase&token=7809557"),
    configurable: true,
  });
  return document;
}

const profile: MasterProfile = {
  identity: {
    firstName: "Asha",
    lastName: "Raman",
    email: "asha@example.com",
    phone: "+1 555 0101",
  },
  location: { city: "New York", country: "United States" },
  links: { website: [], linkedin: "https://linkedin.com/in/asha" },
  workAuth: { authorizedToWork: true, requiresSponsorship: false },
  experience: [
    {
      company: "Coinbase",
      title: "Senior Accountant",
      startDate: "2021-01-01",
      endDate: null,
      current: true,
      bullets: ["Own capital markets close."],
    },
    {
      company: "Acme Finance",
      title: "Accountant",
      startDate: "2018-03-01",
      endDate: "2020-06-01",
      current: false,
      bullets: ["Prepared monthly reporting."],
    },
  ],
  education: [
    {
      school: "Stanford University",
      degree: "Master's Degree",
      field: "Computer Science",
      startDate: "2015-09-01",
      endDate: "2017-06-01",
    },
    {
      school: "Massachusetts Institute of Technology",
      degree: "Bachelor's Degree",
      field: "Physics",
      startDate: "2011-09-01",
      endDate: "2015-06-01",
    },
  ],
  skills: [],
  answers: [],
  documents: {},
};

function cloneRow(container: HTMLElement, selector: string, from: string, to: string) {
  const source = container.querySelector<HTMLElement>(selector);
  if (!source) return;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.innerHTML = clone.innerHTML.replaceAll(from, to);
  for (const attr of ["id", "for", "name", "aria-describedby", "aria-errormessage"]) {
    for (const element of Array.from(clone.querySelectorAll<HTMLElement>(`[${attr}]`))) {
      element.setAttribute(attr, element.getAttribute(attr)!.replaceAll(from, to));
    }
  }
  clone.setAttribute("data-row", to.replace(/\D/g, ""));
  container.insertBefore(clone, container.querySelector("[data-add]"));
}

function wireGreenhouseFixture(document: Document) {
  document.querySelector("[data-add='employment']")?.addEventListener("click", () => {
    cloneRow(document.querySelector(".employment--container") as HTMLElement, ".employment-form", "-0", "-1");
  });
  document.querySelector("[data-add='education']")?.addEventListener("click", () => {
    cloneRow(document.querySelector(".education--container") as HTMLElement, ".education--form", "--0", "--1");
  });
  document.body.addEventListener("click", (event) => {
    const option = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[role='option']") : null;
    if (!option) return;
    const root = option.closest<HTMLElement>(".select");
    const input = root?.querySelector<HTMLInputElement>("input");
    if (!root || !input) return;
    input.value = option.textContent?.trim() ?? "";
    input.setAttribute("value", input.value);
    let value = root.querySelector<HTMLElement>(".select__single-value");
    if (!value) {
      value = document.createElement("span");
      value.className = "select__single-value";
      root.append(value);
    }
    value.textContent = input.value;
  });
}

describe("Greenhouse structured experience filler", () => {
  it("adds and fills employment and education rows without sending those fields to planning", async () => {
    const document = installDom(fixtures["../fixtures/greenhouse-experience.html"]!);
    wireGreenhouseFixture(document);
    const strategy = createGreenhouseFillStrategy();

    await strategy.preparePage?.({ doc: document, profile });
    expect(document.querySelectorAll(".employment-form")).toHaveLength(2);
    expect(document.querySelectorAll(".education--form")).toHaveLength(2);

    const fields = await hydrateChoiceFieldOptions(extractPageFields(document));
    const result = await strategy.fillStructuredFields?.({ doc: document, fields, profile });

    expect(result).toBeTruthy();
    expect((document.getElementById("company-name-0") as HTMLInputElement).value).toBe("Coinbase");
    expect((document.getElementById("title-1") as HTMLInputElement).value).toBe("Accountant");
    expect((document.getElementById("start-date-month-1") as HTMLInputElement).value).toBe("March");
    expect((document.getElementById("end-date-year-1") as HTMLInputElement).value).toBe("2020");
    expect((document.getElementById("current-role-0_1") as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("school--1") as HTMLInputElement).value).toBe("Massachusetts Institute of Technology");
    expect((document.getElementById("degree--0") as HTMLInputElement).value).toBe("Master's Degree");
    expect((document.getElementById("discipline--1") as HTMLInputElement).value).toBe("Physics");

    const remaining = fields.filter((field) => !result!.claimedFieldIds.has(field.fieldId));
    expect(remaining.map((field) => field.label)).not.toContain("Company name");
    expect(remaining.map((field) => field.label)).not.toContain("School");
    expect(result!.records.some((record) => record.source !== "adapter")).toBe(false);
    expect(result!.records.filter((record) => record.status === "filled").length).toBeGreaterThan(8);
  });
});
