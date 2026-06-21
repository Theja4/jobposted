import type { MasterProfile } from "@jobposted/shared";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { workdayAdapter } from "../adapters/workday";
import { extractFields } from "./extract";
import type { FillContext } from "./types";
import { fillWorkdayExperience } from "./workday-experience";

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

const baseProfile: MasterProfile = {
  identity: {
    firstName: "Asha",
    lastName: "Raman",
    email: "asha@example.com",
    phone: "+1 555 0101",
  },
  location: { country: "United States" },
  links: { website: [] },
  workAuth: { authorizedToWork: true, requiresSponsorship: false },
  experience: [],
  education: [
    { school: "Stanford University", degree: "Master's Degree", field: "Computer Science" },
    { school: "Massachusetts Institute of Technology", degree: "Bachelor's Degree", field: "Physics" },
  ],
  skills: ["TypeScript", "React"],
  answers: [],
  documents: {},
};

function context(profile: MasterProfile = baseProfile): FillContext {
  return {
    profile,
    platform: "workday",
    url: "https://factset.wd108.myworkdayjobs.com/jobs/apply",
    overwrite: false,
    demographicsEnabled: false,
    getResume: async () => ({ resumeUrl: null }),
    onField: () => undefined,
    llmMap: async () => null,
  };
}

function workdayExperienceHtml() {
  return `<!doctype html>
    <div data-automation-id="progressBarCompletedStep">My Information</div>
    <div data-automation-id="progressBarActiveStep">3. My Experience</div>
    <main data-automation-id="applyFlowMyExpPage">
      <section role="group" data-row="mit">
        <div data-automation-id="formField-schoolName"><input value="Massachusetts Institute of Technology" /></div>
        <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        <div data-automation-id="formField-fieldOfStudy">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </section>
      <section role="group" data-row="stanford">
        <div data-automation-id="formField-schoolName"><input value="Stanford University" /></div>
        <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        <div data-automation-id="formField-fieldOfStudy">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </section>
      <div data-automation-id="formField-skills">
        <div data-automation-id="multiSelectContainer">
          <div data-automation-id="multiselectInputContainer"><input /></div>
        </div>
      </div>
      <button type="button" data-automation-id="pageFooterNextButton">Save and Continue</button>
      <button type="button" data-automation-id="pageFooterBackButton">Back</button>
      <button type="button" data-automation-id="addAnother">Add Another</button>
    </main>`;
}

function clearListboxes(document: Document) {
  for (const node of Array.from(document.querySelectorAll("[data-test-listbox]"))) node.remove();
}

function wireDegree(document: Document, button: HTMLElement, options: string[]) {
  button.addEventListener("click", () => {
    clearListboxes(document);
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("data-test-listbox", "degree");
    for (const label of options) {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = label;
      option.addEventListener("click", () => {
        button.textContent = label;
        button.setAttribute("aria-valuetext", label);
        option.setAttribute("aria-selected", "true");
        listbox.remove();
      });
      listbox.append(option);
    }
    document.body.append(listbox);
  });
}

function wireTypeahead(document: Document, container: HTMLElement, options: string[]) {
  const root = container.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
  const inputContainer = container.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
  const input = container.querySelector("input") as HTMLInputElement;
  input.addEventListener("input", () => {
    clearListboxes(document);
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("data-test-listbox", "typeahead");
    for (const label of options) {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.textContent = label;
      option.addEventListener("click", () => {
        const chip = document.createElement("span");
        chip.setAttribute("data-automation-id", "selectedItem");
        chip.textContent = label;
        root.insertBefore(chip, inputContainer);
        input.value = "";
        listbox.remove();
      });
      listbox.append(option);
    }
    document.body.append(listbox);
  });
}

function selectedItems(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-automation-id='selectedItem']")).map((item) => item.textContent?.trim());
}

function setupExperienceDom(html = workdayExperienceHtml()) {
  const { document, window } = parseHTML(html);
  installDomGlobals(window);
  return { document, window };
}

describe("fillWorkdayExperience", () => {
  it("fills degree, field of study, and skills while matching education rows by school", async () => {
    const { document } = setupExperienceDom();
    const footerClicks: string[] = [];
    document.querySelectorAll("[data-automation-id='pageFooterNextButton'], [data-automation-id='pageFooterBackButton'], [data-automation-id='addAnother']").forEach((button) => {
      button.addEventListener("click", () => footerClicks.push(button.getAttribute("data-automation-id") ?? ""));
    });

    const rows = Array.from(document.querySelectorAll<HTMLElement>("[role='group']"));
    for (const row of rows) {
      wireDegree(document, row.querySelector("[data-automation-id='formField-degree'] button") as HTMLElement, [
        "High School",
        "Bachelor's Degree",
        "Master's Degree",
      ]);
      wireTypeahead(document, row.querySelector("[data-automation-id='formField-fieldOfStudy']") as HTMLElement, [
        "Computer Science",
        "Physics",
        "Mathematics",
      ]);
    }
    wireTypeahead(document, document.querySelector("[data-automation-id='formField-skills']") as HTMLElement, [
      "React",
      "TypeScript",
      "Ruby",
    ]);

    await fillWorkdayExperience(context());

    const mit = document.querySelector("[data-row='mit']") as HTMLElement;
    const stanford = document.querySelector("[data-row='stanford']") as HTMLElement;
    expect(mit.querySelector("[data-automation-id='formField-degree'] button")?.textContent).toBe("Bachelor's Degree");
    expect(selectedItems(mit.querySelector("[data-automation-id='formField-fieldOfStudy']") as HTMLElement)).toEqual(["Physics"]);
    expect(stanford.querySelector("[data-automation-id='formField-degree'] button")?.textContent).toBe("Master's Degree");
    expect(selectedItems(stanford.querySelector("[data-automation-id='formField-fieldOfStudy']") as HTMLElement)).toEqual(["Computer Science"]);
    expect(selectedItems(document.querySelector("[data-automation-id='formField-skills']") as HTMLElement)).toEqual(["TypeScript", "React"]);
    expect(footerClicks).toEqual([]);
  });

  it("leaves already-filled controls alone and does not click Save, Back, or Add Another", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <section role="group">
          <div data-automation-id="formField-schoolName"><input value="Stanford University" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Bachelor's Degree</button></div>
          <div data-automation-id="formField-fieldOfStudy">
            <div data-automation-id="multiSelectContainer">
              <span data-automation-id="selectedItem">Mathematics</span>
              <div data-automation-id="multiselectInputContainer"><input /></div>
            </div>
          </div>
        </section>
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <span data-automation-id="selectedItem">TypeScript</span>
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
        <button type="button" data-automation-id="pageFooterNextButton">Save and Continue</button>
        <button type="button" data-automation-id="pageFooterBackButton">Back</button>
        <button type="button" data-automation-id="addAnother">Add Another</button>
      </main>`);
    const clicks: string[] = [];
    const inputs: string[] = [];
    for (const button of Array.from(document.querySelectorAll("button"))) {
      button.addEventListener("click", () => clicks.push(button.textContent?.trim() ?? ""));
    }
    for (const input of Array.from(document.querySelectorAll("input"))) {
      input.addEventListener("input", () => inputs.push(input.closest("[data-automation-id]")?.getAttribute("data-automation-id") ?? ""));
    }

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [{ school: "Stanford University", degree: "Master's Degree", field: "Computer Science" }],
        skills: ["React"],
      }),
    );

    expect(document.querySelector("[data-automation-id='formField-degree'] button")?.textContent).toBe("Bachelor's Degree");
    expect(selectedItems(document.querySelector("[data-automation-id='formField-fieldOfStudy']") as HTMLElement)).toEqual(["Mathematics"]);
    expect(selectedItems(document.querySelector("[data-automation-id='formField-skills']") as HTMLElement)).toEqual(["TypeScript"]);
    expect(clicks).toEqual([]);
    expect(inputs).toEqual([]);
  });
});

describe("Workday My Experience extraction guardrails", () => {
  it("keeps dedicated degree, field-of-study, and skills controls out of the generic field loop", () => {
    const { document } = setupExperienceDom();
    const fields = extractFields(document, "workday", []);

    expect(
      fields.some((field) =>
        Boolean(
          field.element.closest(
            "[data-automation-id='formField-degree'], [data-automation-id='formField-fieldOfStudy'], [data-automation-id='formField-skills']",
          ),
        ),
      ),
    ).toBe(false);
  });

  it("reads Workday progressBar step names", () => {
    const { document } = setupExperienceDom();

    expect(workdayAdapter.detectStep(document)).toEqual({ name: "3. My Experience", total: 2 });
  });
});
