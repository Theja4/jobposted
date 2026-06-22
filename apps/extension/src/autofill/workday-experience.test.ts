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

describe("fillWorkdayExperience — blank repeater pages", () => {
  function blankHtml() {
    return `<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <h3>Work Experience</h3>
        <div data-automation-id="workExperienceSection"></div>
        <button type="button" data-automation-id="add-button" data-section="work">Add</button>
        <h3>Education</h3>
        <div data-automation-id="educationSection"></div>
        <button type="button" data-automation-id="add-button" data-section="education">Add</button>
        <h3>Languages</h3>
        <button type="button" data-automation-id="add-button" data-section="languages">Add</button>
        <h3>Skills</h3>
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
        <button type="button" data-automation-id="pageFooterNextButton">Save and Continue</button>
      </main>`;
  }

  const WORK_ROW_TEMPLATE = `<section role="group" data-row="work">
      <div data-automation-id="formField-jobTitle"><input /></div>
      <div data-automation-id="formField-companyName"><input /></div>
      <div data-automation-id="formField-location"><input /></div>
      <div data-automation-id="formField-currentlyWorkHere"><input type="checkbox" /></div>
      <div data-automation-id="formField-startDate"><input data-automation-id="dateSectionMonth-input" aria-label="Month" /><input data-automation-id="dateSectionYear-input" aria-label="Year" /></div>
      <div data-automation-id="formField-endDate"><input data-automation-id="dateSectionMonth-input" aria-label="Month" /><input data-automation-id="dateSectionYear-input" aria-label="Year" /></div>
      <div data-automation-id="formField-roleDescription"><textarea></textarea></div>
    </section>`;
  const EDUCATION_ROW_TEMPLATE = `<section role="group" data-row="education">
      <div data-automation-id="formField-schoolName"><input /></div>
      <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
      <div data-automation-id="formField-fieldOfStudy"><div data-automation-id="multiSelectContainer"><div data-automation-id="multiselectInputContainer"><input /></div></div></div>
      <div data-automation-id="formField-gradeAverage"><input /></div>
      <div data-automation-id="formField-firstYearAttended"><input data-automation-id="dateSectionYear-input" aria-label="Year" /></div>
      <div data-automation-id="formField-lastYearAttended"><input data-automation-id="dateSectionYear-input" aria-label="Year" /></div>
    </section>`;

  function wireAddButton(
    document: Document,
    button: HTMLElement,
    template: string,
    onRow?: (row: HTMLElement) => void,
  ) {
    button.addEventListener("click", () => {
      const holder = document.createElement("div");
      holder.innerHTML = template;
      const row = holder.firstElementChild as HTMLElement;
      button.parentElement?.insertBefore(row, button);
      onRow?.(row);
    });
  }

  function input(scope: Element | null, selector: string) {
    return scope?.querySelector(selector) as HTMLInputElement | null;
  }

  function setupBlank() {
    const { document } = setupExperienceDom(blankHtml());
    const addButtons = Array.from(document.querySelectorAll<HTMLElement>("[data-automation-id='add-button']"));
    const bySection = (section: string) =>
      addButtons.find((button) => button.getAttribute("data-section") === section) as HTMLElement;
    const clicks = { work: 0, education: 0, languages: 0 };
    bySection("work").addEventListener("click", () => (clicks.work += 1));
    bySection("education").addEventListener("click", () => (clicks.education += 1));
    bySection("languages").addEventListener("click", () => (clicks.languages += 1));

    wireAddButton(document, bySection("work"), WORK_ROW_TEMPLATE, (row) => {
      // Simulate a real checkbox toggling its `checked` attribute on click (linkedom does not).
      const box = row.querySelector("[data-automation-id='formField-currentlyWorkHere'] input") as HTMLElement;
      box?.addEventListener("click", () => {
        if (box.hasAttribute("checked")) box.removeAttribute("checked");
        else box.setAttribute("checked", "");
      });
    });
    wireAddButton(document, bySection("education"), EDUCATION_ROW_TEMPLATE, (row) => {
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
    });
    wireTypeahead(document, document.querySelector("[data-automation-id='formField-skills']") as HTMLElement, [
      "TypeScript",
      "React",
    ]);
    return { document, clicks };
  }

  const filledProfile: MasterProfile = {
    ...baseProfile,
    experience: [
      {
        title: "Senior Engineer",
        company: "Acme Corp",
        location: "Remote",
        startDate: "2021-03",
        endDate: "2023-06",
        current: false,
        bullets: ["Built things", "Led the team"],
      },
    ],
    education: [
      {
        school: "Stanford University",
        degree: "Master's Degree",
        field: "Computer Science",
        gpa: "3.9",
        startDate: "2016",
        endDate: "2018",
      },
    ],
    skills: ["TypeScript"],
  };

  it("clicks Add and fills a fresh Work Experience and Education row", async () => {
    const { document, clicks } = setupBlank();

    await fillWorkdayExperience(context(filledProfile));

    const work = document.querySelector("[data-row='work']") as HTMLElement;
    expect(input(work, "[data-automation-id='formField-jobTitle'] input")?.value).toBe("Senior Engineer");
    expect(input(work, "[data-automation-id='formField-companyName'] input")?.value).toBe("Acme Corp");
    expect(input(work, "[data-automation-id='formField-location'] input")?.value).toBe("Remote");
    expect(work.querySelector("[data-automation-id='formField-currentlyWorkHere'] input")?.hasAttribute("checked")).toBe(false);
    const start = work.querySelector("[data-automation-id='formField-startDate']");
    expect(input(start, "[data-automation-id='dateSectionMonth-input']")?.value).toBe("03");
    expect(input(start, "[data-automation-id='dateSectionYear-input']")?.value).toBe("2021");
    const end = work.querySelector("[data-automation-id='formField-endDate']");
    expect(input(end, "[data-automation-id='dateSectionMonth-input']")?.value).toBe("06");
    expect(input(end, "[data-automation-id='dateSectionYear-input']")?.value).toBe("2023");
    expect((work.querySelector("[data-automation-id='formField-roleDescription'] textarea") as HTMLTextAreaElement).value).toBe(
      "Built things\nLed the team",
    );

    const edu = document.querySelector("[data-row='education']") as HTMLElement;
    expect(input(edu, "[data-automation-id='formField-schoolName'] input")?.value).toBe("Stanford University");
    expect(edu.querySelector("[data-automation-id='formField-degree'] button")?.textContent).toBe("Master's Degree");
    expect(selectedItems(edu.querySelector("[data-automation-id='formField-fieldOfStudy']") as HTMLElement)).toEqual([
      "Computer Science",
    ]);
    expect(input(edu, "[data-automation-id='formField-gradeAverage'] input")?.value).toBe("3.9");
    expect(input(edu, "[data-automation-id='formField-firstYearAttended'] input")?.value).toBe("2016");
    expect(input(edu, "[data-automation-id='formField-lastYearAttended'] input")?.value).toBe("2018");

    expect(selectedItems(document.querySelector("[data-automation-id='formField-skills']") as HTMLElement)).toEqual([
      "TypeScript",
    ]);
    expect(clicks).toEqual({ work: 1, education: 1, languages: 0 });
  });

  it("checks 'currently work here' and leaves the end date empty for a current role", async () => {
    const { document } = setupBlank();

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Staff Engineer",
            company: "NowCo",
            startDate: "2022-01",
            endDate: null,
            current: true,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    const work = document.querySelector("[data-row='work']") as HTMLElement;
    expect(work.querySelector("[data-automation-id='formField-currentlyWorkHere'] input")?.hasAttribute("checked")).toBe(true);
    const end = work.querySelector("[data-automation-id='formField-endDate']");
    expect(input(end, "[data-automation-id='dateSectionYear-input']")?.value).toBe("");
  });

  it("does not add or refill rows on a second run", async () => {
    const { document, clicks } = setupBlank();

    await fillWorkdayExperience(context(filledProfile));
    await fillWorkdayExperience(context(filledProfile));

    expect(document.querySelectorAll("[data-row='work']").length).toBe(1);
    expect(document.querySelectorAll("[data-row='education']").length).toBe(1);
    expect(clicks).toEqual({ work: 1, education: 1, languages: 0 });
  });
});
