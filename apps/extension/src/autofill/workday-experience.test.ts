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

function wireTypeaheadAfterEnter(document: Document, container: HTMLElement, options: string[]) {
  const root = container.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
  const inputContainer = container.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
  const input = container.querySelector("input") as HTMLInputElement;
  let searches = 0;
  input.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
    if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
    if (!input.value.trim()) return; // Workday doesn't search an empty box (e.g. an Escape/reset)
    if (searches > 0) return;
    searches += 1;
    clearListboxes(document);
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("data-test-listbox", "typeahead-enter");
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
  return () => searches;
}

function wireSelectiveSkillTypeahead(document: Document, container: HTMLElement, matches: Record<string, string>) {
  const root = container.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
  const inputContainer = container.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
  const input = container.querySelector("input") as HTMLInputElement;
  const searches: string[] = [];
  input.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
    if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
    const query = input.value.trim();
    if (!query || searches.at(-1) === query) return;
    searches.push(query);
    clearListboxes(document);
    const label = Object.entries(matches).find(([needle]) => query.toLowerCase().includes(needle.toLowerCase()))?.[1];
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("data-test-listbox", "skill-selective");
    if (!label) {
      listbox.textContent = "No Items.";
      document.body.append(listbox);
      return;
    }
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
    document.body.append(listbox);
  });
  return () => searches;
}

function wireCheckboxSkillTypeaheadAfterEnter(document: Document, container: HTMLElement, options: string[]) {
  const root = container.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
  const inputContainer = container.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
  const input = container.querySelector("input") as HTMLInputElement;
  let searches = 0;
  input.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
    if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
    if (!input.value.trim()) return;
    searches += 1;
    clearListboxes(document);
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("data-test-listbox", "checkbox-typeahead-enter");
    const header = document.createElement("div");
    header.textContent = `Search Results (${options.length})`;
    listbox.append(header);

    const selectLabel = (label: string) => {
      if (Array.from(root.querySelectorAll("[data-automation-id='selectedItem']")).some((item) => item.textContent?.trim() === label)) {
        return;
      }
      const chip = document.createElement("span");
      chip.setAttribute("data-automation-id", "selectedItem");
      chip.textContent = label;
      root.insertBefore(chip, inputContainer);
      input.value = "";
      listbox.remove();
    };

    for (const label of options) {
      const row = document.createElement("label");
      row.setAttribute("data-automation-id", "promptOption");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      row.append(checkbox, document.createTextNode(` ${label}`));
      row.addEventListener("click", () => selectLabel(label));
      checkbox.addEventListener("click", () => selectLabel(label));
      listbox.append(row);
    }
    document.body.append(listbox);
  });
  return () => searches;
}

function selectedItems(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-automation-id='selectedItem']")).map((item) => item.textContent?.trim());
}

function stubRect(element: HTMLElement, top: number, left: number, width: number, height: number) {
  element.getBoundingClientRect = () =>
    ({
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
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

  it("presses Enter to load Workday skill search results before selecting", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const searches = wireTypeaheadAfterEnter(document, skills, [
      "Slack Software",
      "Slack API",
      "Slack GPT",
    ]);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["Slack"],
      }),
    );

    expect(searches()).toBe(1);
    expect(selectedItems(skills)).toEqual(["Slack Software"]);
  });

  it("preserves configured skill order and only filters sentence-like entries", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const searches = wireSelectiveSkillTypeahead(document, skills, {
      "Acceptance Criteria": "Acceptance Criteria",
      TypeScript: "TypeScript",
      React: "React",
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: [
          "Acceptance Criteria",
          "Success Matrix",
          "TypeScript",
          "Defined PRDs, acceptance criteria, and user stories for platform features",
          "React",
          "Random Internal Phrase",
        ],
      }),
    );

    expect(selectedItems(skills)).toEqual(["Acceptance Criteria", "TypeScript", "React"]);
    expect(searches()).toEqual(["Acceptance Criteria", "Success Matrix", "TypeScript", "React", "Random Internal Phrase"]);
    expect(searches()).not.toContain("Defined PRDs, acceptance criteria, and user stories for platform features");
  }, 30000);

  it("selects checkbox-style Workday skill prompt results after pressing Enter", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const searches = wireCheckboxSkillTypeaheadAfterEnter(document, skills, [
      "JIRA",
      "JIRA Bug Tracking",
      "Zephyr for JIRA",
    ]);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["JIRA"],
      }),
    );

    expect(searches()).toBe(1);
    expect(selectedItems(skills)).toEqual(["JIRA"]);
  });

  it("uses the checkbox inside a Workday skill row when the row click does not commit", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const root = skills.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = skills.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = skills.querySelector("input") as HTMLInputElement;

    input.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      listbox.setAttribute("data-test-listbox", "workday-row-checkbox");
      const row = document.createElement("div");
      row.setAttribute("role", "option");
      row.id = "menuItem-Python";
      row.setAttribute("aria-label", "Python (Programming Language) not checked");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      const label = document.createElement("p");
      label.setAttribute("data-automation-id", "promptOption");
      label.textContent = "Python (Programming Language)";
      checkbox.addEventListener("click", () => {
        if (selectedItems(skills).includes("Python (Programming Language)")) return;
        const chip = document.createElement("span");
        chip.setAttribute("data-automation-id", "selectedItem");
        chip.textContent = "Python (Programming Language)";
        root.insertBefore(chip, inputContainer);
      });
      row.append(checkbox, label);
      listbox.append(row);
      document.body.append(listbox);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["Python"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["Python (Programming Language)"]);
  });

  it("commits Workday skill rows whose checkbox only updates on checked change", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const root = skills.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = skills.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = skills.querySelector("input") as HTMLInputElement;

    input.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      listbox.setAttribute("data-test-listbox", "workday-checkbox-change");
      const row = document.createElement("div");
      row.setAttribute("role", "option");
      row.id = "menuItem-SQL";
      row.setAttribute("data-automation-id", "menuItem");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      const label = document.createElement("p");
      label.setAttribute("data-automation-id", "promptOption");
      label.textContent = "SQL";
      checkbox.addEventListener("change", () => {
        if (!checkbox.checked || selectedItems(skills).includes("SQL")) return;
        const chip = document.createElement("span");
        chip.setAttribute("data-automation-id", "selectedItem");
        chip.textContent = "SQL";
        root.insertBefore(chip, inputContainer);
      });
      row.append(checkbox, label);
      listbox.append(row);
      document.body.append(listbox);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["SQL"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["SQL"]);
  });

  it("matches Workday skill options whose acronym is only in parentheses", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    wireCheckboxSkillTypeaheadAfterEnter(document, skills, [
      "Structured Query Language (SQL)",
      "U-SQL",
      "MySQL",
    ]);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["SQL"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["Structured Query Language (SQL)"]);
  });

  it("prefers the literal exact skill over a parenthetical programming-language variant", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    wireCheckboxSkillTypeaheadAfterEnter(document, skills, [
      "Python (Programming Language)",
      "Python",
      "Python IDLE",
    ]);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["Python"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["Python"]);
  });

  it("scrolls and commits a clipped literal exact skill instead of using a visible synonym", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const root = skills.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = skills.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = skills.querySelector("input") as HTMLInputElement;

    const appendOption = (listbox: HTMLElement, label: string, top: number, commits: boolean | "after-scroll") => {
      const row = document.createElement("label");
      row.setAttribute("data-automation-id", "promptOption");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      row.append(checkbox, document.createTextNode(` ${label}`));
      stubRect(row, top, 0, 220, 32);
      row.addEventListener("click", () => {
        if (!commits || (commits === "after-scroll" && listbox.scrollTop < 350)) return;
        const chip = document.createElement("span");
        chip.setAttribute("data-automation-id", "selectedItem");
        chip.textContent = label;
        root.insertBefore(chip, inputContainer);
      });
      listbox.append(row);
    };

    input.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      listbox.setAttribute("data-test-listbox", "virtualized-skill-list");
      stubRect(listbox, 0, 0, 260, 96);
      appendOption(listbox, "Structured Query Language (SQL)", 0, true);
      appendOption(listbox, "U-SQL", 32, false);
      appendOption(listbox, "SQL", 420, "after-scroll");
      document.body.append(listbox);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["SQL"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["SQL"]);
  });

  it("prefers a partially visible exact skill over a fully visible parenthetical synonym", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const root = skills.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = skills.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = skills.querySelector("input") as HTMLInputElement;

    const appendOption = (listbox: HTMLElement, label: string, top: number) => {
      const row = document.createElement("label");
      row.setAttribute("data-automation-id", "promptOption");
      row.style.top = `${top}px`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      row.append(checkbox, document.createTextNode(` ${label}`));
      stubRect(row, top, 0, 260, 32);
      row.addEventListener("click", () => {
        const chip = document.createElement("span");
        chip.setAttribute("data-automation-id", "selectedItem");
        chip.textContent = label;
        root.insertBefore(chip, inputContainer);
      });
      listbox.append(row);
    };

    input.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      stubRect(listbox, 0, 0, 260, 96);
      appendOption(listbox, "Structured Query Language (SQL)", 0);
      appendOption(listbox, "SQL", 80);
      document.body.append(listbox);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["SQL"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["SQL"]);
  });

  it("scrolls a virtualized exact skill row before clicking it", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const root = skills.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = skills.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = skills.querySelector("input") as HTMLInputElement;

    const appendOption = (listbox: HTMLElement, label: string, top: number) => {
      const row = document.createElement("label");
      row.setAttribute("data-automation-id", "promptOption");
      row.style.top = `${top}px`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      row.append(checkbox, document.createTextNode(` ${label}`));
      stubRect(row, top, 0, 260, 32);
      row.addEventListener("click", () => {
        if (label !== "PRDs" || listbox.scrollTop < 180) return;
        const chip = document.createElement("span");
        chip.setAttribute("data-automation-id", "selectedItem");
        chip.textContent = label;
        root.insertBefore(chip, inputContainer);
      });
      listbox.append(row);
    };

    input.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      stubRect(listbox, 0, 0, 260, 96);
      appendOption(listbox, "Presto", 0);
      appendOption(listbox, "PR Research", 32);
      appendOption(listbox, "Professional Digital Services (PSDS)", 64);
      appendOption(listbox, "PRDs", 240);
      document.body.append(listbox);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["PRDs"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["PRDs"]);
  });

  it("uses the visible Workday checkbox control when a hidden checkbox is present first", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const root = skills.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = skills.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = skills.querySelector("input") as HTMLInputElement;

    input.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      stubRect(listbox, 0, 0, 260, 96);
      const row = document.createElement("div");
      row.id = "menuItem-PRDs";
      row.setAttribute("role", "option");
      row.setAttribute("data-automation-id", "menuItem");
      row.setAttribute("aria-label", "PRDs not checked");
      stubRect(row, 0, 0, 260, 32);
      const hiddenInput = document.createElement("input");
      hiddenInput.type = "checkbox";
      stubRect(hiddenInput, 0, 0, 0, 0);
      const visibleCheckbox = document.createElement("div");
      visibleCheckbox.setAttribute("role", "checkbox");
      visibleCheckbox.setAttribute("data-automation-id", "checkboxPanel");
      stubRect(visibleCheckbox, 8, 8, 16, 16);
      const label = document.createElement("span");
      label.setAttribute("data-automation-id", "promptOption");
      label.textContent = "PRDs";
      visibleCheckbox.addEventListener("click", () => {
        const chip = document.createElement("span");
        chip.setAttribute("data-automation-id", "selectedItem");
        chip.textContent = "PRDs";
        root.insertBefore(chip, inputContainer);
      });
      row.append(hiddenInput, visibleCheckbox, label);
      listbox.append(row);
      document.body.append(listbox);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["PRDs"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["PRDs"]);
  });

  it("does not abandon the skills section after three misses when a later exact option exists", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const searches = wireSelectiveSkillTypeahead(document, skills, {
      Delta: "Delta",
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["Alpha", "Beta", "Gamma", "Delta"],
      }),
    );

    expect(searches()).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    expect(selectedItems(skills)).toEqual(["Delta"]);
  }, 30000);

  it("waits through stale non-matching skill rows until the exact Workday option arrives", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const root = skills.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = skills.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = skills.querySelector("input") as HTMLInputElement;

    const renderOptions = (labels: string[]) => {
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      listbox.setAttribute("data-test-listbox", "late-skill-results");
      for (const label of labels) {
        const row = document.createElement("div");
        row.setAttribute("role", "option");
        row.textContent = label;
        row.addEventListener("click", () => {
          const chip = document.createElement("span");
          chip.setAttribute("data-automation-id", "selectedItem");
          chip.textContent = label;
          root.insertBefore(chip, inputContainer);
          input.value = "";
          listbox.remove();
        });
        listbox.append(row);
      }
      document.body.append(listbox);
    };

    input.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      renderOptions(["Netezza SQL", "Spark SQL", "SQL Manager"]);
      setTimeout(() => renderOptions(["Python", "Python (Programming Language)"]), 3300);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["Python"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["Python"]);
  }, 15000);

  it("selects many skills in sequence across separate per-query searches", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const root = skills.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = skills.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = skills.querySelector("input") as HTMLInputElement;
    const catalog: Record<string, string[]> = {
      sql: ["Structured Query Language (SQL)", "U-SQL", "SQL"],
      python: ["Python (Programming Language)", "Python IDLE"],
      jira: ["Atlassian JIRA", "JIRA Tool"],
      react: ["React", "React Native"],
    };
    // Search-on-type, but the selected row's listbox + input text are intentionally left behind
    // (stale) — the filler must reset the input before the next skill or it would act on the leftover.
    input.addEventListener("input", () => {
      clearListboxes(document);
      const query = input.value.trim().toLowerCase();
      if (!query) return;
      const labels = catalog[query] ?? [];
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      listbox.setAttribute("data-test-listbox", "sequential");
      if (labels.length === 0) {
        listbox.textContent = "No Items.";
        document.body.append(listbox);
        return;
      }
      for (const label of labels) {
        const row = document.createElement("label");
        row.setAttribute("data-automation-id", "promptOption");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        row.append(checkbox, document.createTextNode(` ${label}`));
        const select = () => {
          if (Array.from(root.querySelectorAll("[data-automation-id='selectedItem']")).some((item) => item.textContent?.trim() === label)) {
            return;
          }
          const chip = document.createElement("span");
          chip.setAttribute("data-automation-id", "selectedItem");
          chip.textContent = label;
          root.insertBefore(chip, inputContainer);
        };
        row.addEventListener("click", select);
        checkbox.addEventListener("click", select);
        listbox.append(row);
      }
      document.body.append(listbox);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["SQL", "Python", "JIRA", "React"],
      }),
    );

    expect(selectedItems(skills)).toEqual([
      "SQL",
      "Python (Programming Language)",
      "Atlassian JIRA",
      "React",
    ]);
  });

  it("fills configured skills past the old fourteen-skill cap", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const configuredSkills = [
      "AlphaTool",
      "BravoTool",
      "CharlieTool",
      "DeltaTool",
      "EchoTool",
      "FoxtrotTool",
      "GolfTool",
      "HotelTool",
      "IndiaTool",
      "JulietTool",
      "KiloTool",
      "LimaTool",
      "MikeTool",
      "NovemberTool",
      "OscarTool",
      "PapaTool",
      "QuebecTool",
      "RomeoTool",
    ];
    wireTypeahead(document, skills, configuredSkills);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: configuredSkills,
      }),
    );

    expect(selectedItems(skills)).toEqual(configuredSkills);
  }, 30000);

  it("treats reused Workday virtualized rows as fresh when their labels change", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    const root = skills.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = skills.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = skills.querySelector("input") as HTMLInputElement;
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("data-test-listbox", "reused-virtual-rows");
    const row = document.createElement("div");
    row.setAttribute("role", "option");
    row.id = "menuItem-REMOTE_SKILL-1";
    row.textContent = "Python (Programming Language)";
    row.addEventListener("click", () => {
      if (row.textContent?.trim() !== "SQL") return;
      const chip = document.createElement("span");
      chip.setAttribute("data-automation-id", "selectedItem");
      chip.textContent = "SQL";
      root.insertBefore(chip, inputContainer);
    });
    listbox.append(row);
    document.body.append(listbox);

    input.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      setTimeout(() => {
        row.textContent = "SQL";
      }, 360);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["SQL"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["SQL"]);
  });

  it("prefers the exact Workday skill over a fuzzy acronym neighbor", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    wireCheckboxSkillTypeaheadAfterEnter(document, skills, ["U-SQL", "SQL", "MySQL"]);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["SQL"],
      }),
    );

    expect(selectedItems(skills)).toEqual(["SQL"]);
  });

  it("does not fill a different short-acronym Workday skill when the exact skill is missing", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    wireCheckboxSkillTypeaheadAfterEnter(document, skills, ["U-SQL", "MySQL"]);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["SQL"],
      }),
    );

    expect(selectedItems(skills)).toEqual([]);
  }, 15000);

  it("does not treat existing Workday selected pills as fresh skill search options", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <div data-automation-id="formField-fieldOfStudy">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
            <ul role="listbox" data-automation-id="selectedItemList" aria-label="items selected">
              <li role="presentation" data-automation-id="menuItem">
                <div role="option" data-automation-id="selectedItem" aria-label="U-SQL, press delete to clear value." title="U-SQL">
                  <p data-automation-id="promptOption" data-automation-label="U-SQL">U-SQL</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <div data-automation-id="formField-skills">
          <div data-automation-id="multiSelectContainer">
            <div data-automation-id="multiselectInputContainer"><input /></div>
          </div>
        </div>
      </main>`);
    const skills = document.querySelector("[data-automation-id='formField-skills']") as HTMLElement;
    // Real Workday answers a no-match search with a "No Items." notice (never silence), which is how
    // the filler knows to give up. The U-SQL pill lives in the *field of study* field, not skills.
    const skillsInput = skills.querySelector("input") as HTMLInputElement;
    const showNoItems = () => {
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      listbox.setAttribute("data-test-listbox", "skills-empty");
      listbox.textContent = "No Items.";
      document.body.append(listbox);
    };
    skillsInput.addEventListener("input", showNoItems);
    skillsInput.addEventListener("keydown", showNoItems);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [],
        skills: ["U-SQL"],
      }),
    );

    expect(selectedItems(skills)).toEqual([]);
  });

  it("maps field-of-study aliases to Workday controlled options", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <section role="group" data-row="data">
          <div data-automation-id="formField-schoolName"><input value="Data University" /></div>
          <div data-automation-id="formField-fieldOfStudy">
            <div data-automation-id="multiSelectContainer">
              <div data-automation-id="multiselectInputContainer"><input /></div>
            </div>
          </div>
        </section>
        <section role="group" data-row="it">
          <div data-automation-id="formField-schoolName"><input value="IT University" /></div>
          <div data-automation-id="formField-fieldOfStudy">
            <div data-automation-id="multiSelectContainer">
              <div data-automation-id="multiselectInputContainer"><input /></div>
            </div>
          </div>
        </section>
        <section role="group" data-row="ece">
          <div data-automation-id="formField-schoolName"><input value="ECE University" /></div>
          <div data-automation-id="formField-fieldOfStudy">
            <div data-automation-id="multiSelectContainer">
              <div data-automation-id="multiselectInputContainer"><input /></div>
            </div>
          </div>
        </section>
      </main>`);
    const data = document.querySelector("[data-row='data'] [data-automation-id='formField-fieldOfStudy']") as HTMLElement;
    const it = document.querySelector("[data-row='it'] [data-automation-id='formField-fieldOfStudy']") as HTMLElement;
    const ece = document.querySelector("[data-row='ece'] [data-automation-id='formField-fieldOfStudy']") as HTMLElement;
    wireTypeaheadAfterEnter(document, data, [
      "Computer and Information Science",
      "Computer Engineering",
      "Electrical Engineering",
    ]);
    wireTypeaheadAfterEnter(document, it, [
      "Computer and Information Science",
      "Computer Engineering",
      "Electrical Engineering",
    ]);
    wireTypeaheadAfterEnter(document, ece, [
      "Aerospace Engineering",
      "Computer Engineering",
      "Electrical Engineering",
    ]);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [
          { school: "Data University", field: "Data Science" },
          { school: "IT University", field: "Information Technology" },
          { school: "ECE University", field: "ECE" },
        ],
        skills: [],
      }),
    );

    expect(selectedItems(data)).toEqual(["Computer and Information Science"]);
    expect(selectedItems(it)).toEqual(["Computer and Information Science"]);
    expect(selectedItems(ece)).toEqual(["Electrical Engineering"]);
  });

  it("skips field of study when Workday already has a selected-item-list chip", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <section role="group" data-row="ece">
          <div data-automation-id="formField-schoolName"><input value="ECE University" /></div>
          <div data-automation-id="formField-fieldOfStudy">
            <div data-automation-id="multiSelectContainer">
              <ul role="listbox" data-automation-id="selectedItemList" aria-label="items selected">
                <li role="presentation" data-automation-id="menuItem">
                  <div role="option" data-automation-id="menuItem" aria-label="Electrical Engineering, press delete to clear value.">
                    <button type="button" aria-label="Remove Electrical Engineering"></button>
                    <p data-automation-id="promptOption" data-automation-label="Electrical Engineering">Electrical Engineering</p>
                  </div>
                </li>
              </ul>
              <div data-automation-id="multiselectInputContainer"><input /></div>
            </div>
          </div>
        </section>
      </main>`);
    const field = document.querySelector("[data-row='ece'] [data-automation-id='formField-fieldOfStudy']") as HTMLElement;
    const input = field.querySelector("input") as HTMLInputElement;
    let searches = 0;
    input.addEventListener("input", () => {
      searches += 1;
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [{ school: "ECE University", field: "ECE" }],
        skills: [],
      }),
    );

    expect(searches).toBe(0);
    expect(field.textContent).toContain("Electrical Engineering");
  });

  it("does not accept a highlighted unrelated field-of-study option while searching aliases", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <section role="group" data-row="ece">
          <div data-automation-id="formField-schoolName"><input value="ECE University" /></div>
          <div data-automation-id="formField-fieldOfStudy">
            <div data-automation-id="multiSelectContainer">
              <div data-automation-id="multiselectInputContainer"><input /></div>
            </div>
          </div>
        </section>
      </main>`);
    const field = document.querySelector("[data-row='ece'] [data-automation-id='formField-fieldOfStudy']") as HTMLElement;
    const root = field.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = field.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = field.querySelector("input") as HTMLInputElement;
    let committed = false;
    const clickedLabels: string[] = [];

    input.addEventListener("input", () => {
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      listbox.setAttribute("data-test-listbox", "unrelated-field-list");
      for (const label of ["Accounting", "Actuarial Science", "Advertising", "Aerospace Engineering"]) {
        const option = document.createElement("div");
        option.setAttribute("role", "option");
        option.textContent = label;
        option.addEventListener("click", () => {
          clickedLabels.push(label);
          const chip = document.createElement("span");
          chip.setAttribute("data-automation-id", "selectedItem");
          chip.textContent = label;
          root.insertBefore(chip, inputContainer);
        });
        listbox.append(option);
      }
      document.body.append(listbox);
    });
    input.addEventListener("keydown", (event) => {
      // Simulate Workday's highlighted default commit only for Enter, not Escape cleanup.
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      if (committed) return;
      committed = true;
      const chip = document.createElement("span");
      chip.setAttribute("data-automation-id", "selectedItem");
      chip.textContent = "Aerospace Engineering";
      root.insertBefore(chip, inputContainer);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [{ school: "ECE University", field: "ECE" }],
        skills: [],
      }),
    );

    expect(selectedItems(field)).toEqual([]);
    expect(clickedLabels).toEqual([]);
  }, 10000);

  it("removes a wrong field-of-study chip if Enter commits the highlighted option", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <section role="group" data-row="ece">
          <div data-automation-id="formField-schoolName"><input value="ECE University" /></div>
          <div data-automation-id="formField-fieldOfStudy">
            <div data-automation-id="multiSelectContainer">
              <div data-automation-id="multiselectInputContainer"><input /></div>
            </div>
          </div>
        </section>
      </main>`);
    const field = document.querySelector("[data-row='ece'] [data-automation-id='formField-fieldOfStudy']") as HTMLElement;
    const root = field.querySelector<HTMLElement>("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const inputContainer = field.querySelector<HTMLElement>("[data-automation-id='multiselectInputContainer']") as HTMLElement;
    const input = field.querySelector("input") as HTMLInputElement;
    let committed = false;

    input.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
      if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
      // Workday answers the no-match search with "No Items." (so the filler stops waiting)...
      clearListboxes(document);
      const listbox = document.createElement("div");
      listbox.setAttribute("role", "listbox");
      listbox.setAttribute("data-test-listbox", "ece-empty");
      listbox.textContent = "No Items.";
      document.body.append(listbox);
      // ...but also commits the highlighted default the first time, which the filler must clean up.
      if (committed) return;
      committed = true;
      const chip = document.createElement("span");
      chip.setAttribute("data-automation-id", "selectedItem");
      chip.textContent = "Aerospace Engineering";
      root.insertBefore(chip, inputContainer);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [{ school: "ECE University", field: "ECE" }],
        skills: [],
      }),
    );

    expect(selectedItems(field)).toEqual([]);
  }, 10000);

  it("maps technology degree aliases to the right Workday degree level", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <section role="group" data-row="btech">
          <div data-automation-id="formField-schoolName"><input value="BTech University" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        </section>
        <section role="group" data-row="mtech">
          <div data-automation-id="formField-schoolName"><input value="MTech University" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        </section>
        <section role="group" data-row="ms">
          <div data-automation-id="formField-schoolName"><input value="MS University" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        </section>
      </main>`);
    const options = [
      "Doctorate degree (e.g. PhD, PsyD, EdD, JD)",
      "Masters degree (e.g. MBA, MA, MS, Meng)",
      "Three to Four year University Bachelors degree (e.g. BA, BS)",
      "Joint: Three to Four year University Bachelors degree (e.g. BA, BS)",
      "Major: Three to Four year University Bachelors degree (e.g. BA, BS)",
    ];
    const btech = document.querySelector("[data-row='btech'] [data-automation-id='formField-degree'] button") as HTMLElement;
    const mtech = document.querySelector("[data-row='mtech'] [data-automation-id='formField-degree'] button") as HTMLElement;
    const ms = document.querySelector("[data-row='ms'] [data-automation-id='formField-degree'] button") as HTMLElement;
    wireDegree(document, btech, options);
    wireDegree(document, mtech, options);
    wireDegree(document, ms, options);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [
          { school: "BTech University", degree: "B.Tech" },
          { school: "MTech University", degree: "MTech" },
          { school: "MS University", degree: "Master of Science" },
        ],
        skills: [],
      }),
    );

    expect(btech.textContent).toBe("Three to Four year University Bachelors degree (e.g. BA, BS)");
    expect(mtech.textContent).toBe("Masters degree (e.g. MBA, MA, MS, Meng)");
    expect(ms.textContent).toBe("Masters degree (e.g. MBA, MA, MS, Meng)");
  });

  it("selects the correct plain degree levels when qualified variants are also available", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <section role="group" data-row="btech">
          <div data-automation-id="formField-schoolName"><input value="BTech University" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        </section>
        <section role="group" data-row="mtech">
          <div data-automation-id="formField-schoolName"><input value="MTech University" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        </section>
        <section role="group" data-row="phd">
          <div data-automation-id="formField-schoolName"><input value="PhD University" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        </section>
        <section role="group" data-row="diploma">
          <div data-automation-id="formField-schoolName"><input value="Diploma Institute" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        </section>
        <section role="group" data-row="hsc">
          <div data-automation-id="formField-schoolName"><input value="Higher Secondary School" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        </section>
      </main>`);
    const btech = document.querySelector("[data-row='btech'] [data-automation-id='formField-degree'] button") as HTMLElement;
    const mtech = document.querySelector("[data-row='mtech'] [data-automation-id='formField-degree'] button") as HTMLElement;
    const phd = document.querySelector("[data-row='phd'] [data-automation-id='formField-degree'] button") as HTMLElement;
    const diploma = document.querySelector("[data-row='diploma'] [data-automation-id='formField-degree'] button") as HTMLElement;
    const hsc = document.querySelector("[data-row='hsc'] [data-automation-id='formField-degree'] button") as HTMLElement;
    const options = [
      "Select One",
      "Associates",
      "Honours Bachelor",
      "Bachelors",
      "Honours Master",
      "Masters",
      "Doctorate",
      "Certificate",
      "High School",
    ];
    wireDegree(document, btech, options);
    wireDegree(document, mtech, options);
    wireDegree(document, phd, options);
    wireDegree(document, diploma, options);
    wireDegree(document, hsc, options);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [
          { school: "BTech University", degree: "Bachelor of Technology B.Tech" },
          { school: "MTech University", degree: "Master of Technology M.Tech" },
          { school: "PhD University", degree: "PhD" },
          { school: "Diploma Institute", degree: "Postgraduate Diploma" },
          { school: "Higher Secondary School", degree: "Higher Secondary" },
        ],
        skills: [],
      }),
    );

    expect(btech.textContent).toBe("Bachelors");
    expect(mtech.textContent).toBe("Masters");
    expect(phd.textContent).toBe("Doctorate");
    expect(diploma.textContent).toBe("Certificate");
    expect(hsc.textContent).toBe("High School");
  });

  it("selects a degree whose listbox renders late and only commits the option on Enter", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <section role="group" data-row="btech">
          <div data-automation-id="formField-schoolName"><input value="BTech University" /></div>
          <div data-automation-id="formField-degree"><button type="button" aria-haspopup="listbox">Select One</button></div>
        </section>
      </main>`);
    const button = document.querySelector("[data-automation-id='formField-degree'] button") as HTMLElement;
    // Workday-style: the portal listbox renders a beat after the click, and clicking an option does
    // NOT commit — only Enter on the focused option updates the button.
    button.addEventListener("click", () => {
      clearListboxes(document);
      setTimeout(() => {
        const listbox = document.createElement("div");
        listbox.setAttribute("role", "listbox");
        listbox.setAttribute("data-test-listbox", "degree-async");
        for (const label of [
          "Doctorate degree (e.g. PhD, PsyD, EdD, JD)",
          "Masters degree (e.g. MBA, MA, MS, Meng)",
          "Three to Four year University Bachelors degree (e.g. BA, BS)",
        ]) {
          const option = document.createElement("div");
          option.setAttribute("role", "option");
          option.textContent = label;
          option.addEventListener("keydown", (event) => {
            const keyboardEvent = event as KeyboardEvent;
            if (keyboardEvent.key && keyboardEvent.key !== "Enter") return;
            if (keyboardEvent.keyCode && keyboardEvent.keyCode !== 13) return;
            button.textContent = label;
            button.setAttribute("aria-valuetext", label);
            listbox.remove();
          });
          listbox.append(option);
        }
        document.body.append(listbox);
      }, 220);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [{ school: "BTech University", degree: "B.Tech" }],
        skills: [],
      }),
    );

    expect(button.textContent).toBe("Three to Four year University Bachelors degree (e.g. BA, BS)");
  });

  it("maps a plain Computer Science field of study to Computer and Information Science", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <section role="group" data-row="cs">
          <div data-automation-id="formField-schoolName"><input value="CS University" /></div>
          <div data-automation-id="formField-fieldOfStudy">
            <div data-automation-id="multiSelectContainer">
              <div data-automation-id="multiselectInputContainer"><input /></div>
            </div>
          </div>
        </section>
      </main>`);
    const cs = document.querySelector("[data-row='cs'] [data-automation-id='formField-fieldOfStudy']") as HTMLElement;
    wireTypeaheadAfterEnter(document, cs, [
      "Computer and Information Science",
      "Computer Engineering",
      "Information Science",
    ]);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        education: [{ school: "CS University", field: "Computer Science" }],
        skills: [],
      }),
    );

    expect(selectedItems(cs)).toEqual(["Computer and Information Science"]);
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

  function wireRerenderingAddButton(
    document: Document,
    button: HTMLElement,
    template: string,
    onRow?: (row: HTMLElement) => void,
  ) {
    let clicks = 0;
    const attach = (current: HTMLElement) => {
      current.addEventListener("click", () => {
        const parent = current.parentElement;
        if (!parent) return;
        clicks += 1;
        const holder = document.createElement("div");
        holder.innerHTML = template;
        const row = holder.firstElementChild as HTMLElement;
        parent.insertBefore(row, current);
        onRow?.(row);

        const next = current.cloneNode(true) as HTMLElement;
        next.setAttribute("data-automation-id", "addAnother");
        next.textContent = "Add Another";
        current.replaceWith(next);
        attach(next);
      });
    };
    attach(button);
    return () => clicks;
  }

  function wireDelayedTextAddButton(
    document: Document,
    button: HTMLElement,
    template: string,
    delayMs: number,
    onRow?: (row: HTMLElement) => void,
  ) {
    let clicks = 0;
    const attach = (current: HTMLElement) => {
      current.removeAttribute("data-automation-id");
      current.addEventListener("click", () => {
        const parent = current.parentElement;
        if (!parent) return;
        clicks += 1;
        const timeout = document.defaultView?.setTimeout ?? window.setTimeout;
        timeout(() => {
          const holder = document.createElement("div");
          holder.innerHTML = template;
          const row = holder.firstElementChild as HTMLElement;
          parent.insertBefore(row, current);
          onRow?.(row);

          const next = current.cloneNode(true) as HTMLElement;
          next.removeAttribute("data-automation-id");
          next.textContent = "Add Another";
          current.replaceWith(next);
          attach(next);
        }, delayMs);
      });
    };
    attach(button);
    return () => clicks;
  }

  function input(scope: Element | null, selector: string) {
    return scope?.querySelector(selector) as HTMLInputElement | null;
  }

  function wireControlledRecognition(row: HTMLElement, selector: string, key: string, recognized: Set<string>) {
    const field = input(row, selector);
    if (!field) return;
    let focused = false;
    field.addEventListener("focusin", () => {
      focused = true;
    });
    const accept = () => {
      if (focused && field.value.trim()) recognized.add(key);
    };
    field.addEventListener("input", accept);
    field.addEventListener("change", accept);
    field.addEventListener("focusout", accept);
    field.addEventListener("blur", accept);
  }

  function wireWorkExperienceRecognition(row: HTMLElement, recognized: Set<string>) {
    wireControlledRecognition(row, "[data-automation-id='formField-jobTitle'] input", "title", recognized);
    wireControlledRecognition(row, "[data-automation-id='formField-companyName'] input", "company", recognized);
    wireControlledRecognition(row, "[data-automation-id='formField-startDate'] [data-automation-id='dateSectionMonth-input']", "from-month", recognized);
    wireControlledRecognition(row, "[data-automation-id='formField-startDate'] [data-automation-id='dateSectionYear-input']", "from-year", recognized);
    wireControlledRecognition(row, "[data-automation-id='formField-endDate'] [data-automation-id='dateSectionMonth-input']", "to-month", recognized);
    wireControlledRecognition(row, "[data-automation-id='formField-endDate'] [data-automation-id='dateSectionYear-input']", "to-year", recognized);
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

  function setupBlankWithRerenderedAddButtons() {
    const { document } = setupExperienceDom(blankHtml());
    const addButtons = Array.from(document.querySelectorAll<HTMLElement>("[data-automation-id='add-button']"));
    const bySection = (section: string) =>
      addButtons.find((button) => button.getAttribute("data-section") === section) as HTMLElement;
    const workClicks = wireRerenderingAddButton(document, bySection("work"), WORK_ROW_TEMPLATE);
    const educationClicks = wireRerenderingAddButton(document, bySection("education"), EDUCATION_ROW_TEMPLATE);
    return {
      document,
      clicks: () => ({ work: workClicks(), education: educationClicks() }),
    };
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

  it("re-finds replaced Add Another buttons and fills multiple Work Experience and Education rows", async () => {
    const { document, clicks } = setupBlankWithRerenderedAddButtons();

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Senior Engineer",
            company: "Acme Corp",
            location: "Remote",
            startDate: "2021-03",
            endDate: "2023-06",
            current: false,
            bullets: [],
          },
          {
            title: "Engineering Manager",
            company: "Beta Labs",
            location: "New York",
            startDate: "2023-07",
            endDate: null,
            current: true,
            bullets: [],
          },
        ],
        education: [
          { school: "Stanford University" },
          { school: "Massachusetts Institute of Technology" },
        ],
        skills: [],
      }),
    );

    const workRows = Array.from(document.querySelectorAll<HTMLElement>("[data-row='work']"));
    const educationRows = Array.from(document.querySelectorAll<HTMLElement>("[data-row='education']"));
    expect(workRows).toHaveLength(2);
    expect(educationRows).toHaveLength(2);
    expect(workRows.map((row) => input(row, "[data-automation-id='formField-jobTitle'] input")?.value)).toEqual([
      "Senior Engineer",
      "Engineering Manager",
    ]);
    expect(workRows.map((row) => input(row, "[data-automation-id='formField-companyName'] input")?.value)).toEqual([
      "Acme Corp",
      "Beta Labs",
    ]);
    expect(educationRows.map((row) => input(row, "[data-automation-id='formField-schoolName'] input")?.value)).toEqual([
      "Stanford University",
      "Massachusetts Institute of Technology",
    ]);
    expect(clicks()).toEqual({ work: 2, education: 2 });
  });

  it("fills the first Workday work row before clicking Add Another for the second", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <h3>Work Experience</h3>
        ${WORK_ROW_TEMPLATE}
        <button type="button">Add Another</button>
      </main>`);
    const addButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "Add Another",
    ) as HTMLElement;
    let clicks = 0;
    addButton.addEventListener("click", () => {
      clicks += 1;
      const firstRow = document.querySelector("[data-row='work']") as HTMLElement;
      if (!input(firstRow, "[data-automation-id='formField-jobTitle'] input")?.value) return;
      const holder = document.createElement("div");
      holder.innerHTML = WORK_ROW_TEMPLATE;
      addButton.parentElement?.insertBefore(holder.firstElementChild as HTMLElement, addButton);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Analyst (Product)",
            company: "ION Group",
            location: "Hyderabad, India",
            startDate: "2021-10",
            endDate: "2026-03",
            current: false,
            bullets: [],
          },
          {
            title: "Product Intern",
            company: "Acme Labs",
            location: "Remote",
            startDate: "2020-01",
            endDate: "2021-09",
            current: false,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    const workRows = Array.from(document.querySelectorAll<HTMLElement>("[data-row='work']"));
    expect(workRows).toHaveLength(2);
    expect(workRows.map((row) => input(row, "[data-automation-id='formField-jobTitle'] input")?.value)).toEqual([
      "Analyst (Product)",
      "Product Intern",
    ]);
    expect(clicks).toBe(1);
  });

  it("adds the second work experience when each entry has its own numbered sub-heading", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <h3>Work Experience</h3>
        <h4>Work Experience 1</h4>
        ${WORK_ROW_TEMPLATE}
        <button type="button">Add Another</button>
        <h3>Education</h3>
      </main>`);
    const addButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "Add Another",
    ) as HTMLElement;
    let clicks = 0;
    addButton.addEventListener("click", () => {
      clicks += 1;
      const lastRow = Array.from(document.querySelectorAll("[data-row='work']")).pop() as HTMLElement;
      if (!input(lastRow, "[data-automation-id='formField-jobTitle'] input")?.value) return;
      const count = document.querySelectorAll("[data-row='work']").length;
      const subHeading = document.createElement("h4");
      subHeading.textContent = `Work Experience ${count + 1}`;
      const holder = document.createElement("div");
      holder.innerHTML = WORK_ROW_TEMPLATE;
      addButton.parentElement?.insertBefore(subHeading, addButton);
      addButton.parentElement?.insertBefore(holder.firstElementChild as HTMLElement, addButton);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Analyst (Product)",
            company: "ION Group",
            location: "Hyderabad, India",
            startDate: "2021-10",
            endDate: "2026-03",
            current: false,
            bullets: [],
          },
          {
            title: "Product Intern",
            company: "Acme Labs",
            location: "Remote",
            startDate: "2020-01",
            endDate: "2021-09",
            current: false,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    const workRows = Array.from(document.querySelectorAll<HTMLElement>("[data-row='work']"));
    expect(workRows).toHaveLength(2);
    expect(workRows.map((row) => input(row, "[data-automation-id='formField-jobTitle'] input")?.value)).toEqual([
      "Analyst (Product)",
      "Product Intern",
    ]);
    expect(clicks).toBe(1);
  });

  it("detects Workday work rows even when row wrappers do not expose role=group", async () => {
    const workRow = WORK_ROW_TEMPLATE.replace('section role="group"', "section");
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <h3>Work Experience</h3>
        ${workRow}
        <button type="button">Add Another</button>
      </main>`);
    const addButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "Add Another",
    ) as HTMLElement;
    addButton.addEventListener("click", () => {
      const firstRow = document.querySelector("[data-row='work']") as HTMLElement;
      if (!input(firstRow, "[data-automation-id='formField-jobTitle'] input")?.value) return;
      const holder = document.createElement("div");
      holder.innerHTML = workRow;
      addButton.parentElement?.insertBefore(holder.firstElementChild as HTMLElement, addButton);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Analyst (Product)",
            company: "ION Group",
            location: "Hyderabad, India",
            startDate: "2021-10",
            endDate: "2026-03",
            current: false,
            bullets: [],
          },
          {
            title: "Product Intern",
            company: "Acme Labs",
            location: "Remote",
            startDate: "2020-01",
            endDate: "2021-09",
            current: false,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    const workRows = Array.from(document.querySelectorAll<HTMLElement>("[data-row='work']"));
    expect(workRows).toHaveLength(2);
    expect(workRows.map((row) => input(row, "[data-automation-id='formField-jobTitle'] input")?.value)).toEqual([
      "Analyst (Product)",
      "Product Intern",
    ]);
  });

  it("fills Workday rows when individual field wrappers expose role=group", async () => {
    const workRow = WORK_ROW_TEMPLATE
      .replace('section role="group"', "section")
      .replaceAll("<div data-automation-id=\"formField-", "<div role=\"group\" data-automation-id=\"formField-");
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <h3>Work Experience</h3>
        ${workRow}
      </main>`);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Analyst (Product)",
            company: "ION Group",
            location: "Hyderabad, India",
            startDate: "2021-10",
            endDate: "2026-03",
            current: false,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    const row = document.querySelector<HTMLElement>("[data-row='work']") as HTMLElement;
    expect(input(row, "[data-automation-id='formField-jobTitle'] input")?.value).toBe("Analyst (Product)");
    expect(input(row, "[data-automation-id='formField-companyName'] input")?.value).toBe("ION Group");
    expect(input(row, "[data-automation-id='formField-location'] input")?.value).toBe("Hyderabad, India");
  });

  it("fills the whole Workday row when fields are split across nested groups", async () => {
    const splitWorkRow = `<section data-row="work">
      <div data-subgroup="summary">
        <div data-automation-id="formField-jobTitle"><input /></div>
        <div data-automation-id="formField-companyName"><input /></div>
      </div>
      <div data-subgroup="details">
        <div data-automation-id="formField-location"><input /></div>
        <div data-automation-id="formField-currentlyWorkHere"><input type="checkbox" /></div>
        <div data-automation-id="formField-startDate"><input data-automation-id="dateSectionMonth-input" aria-label="Month" /><input data-automation-id="dateSectionYear-input" aria-label="Year" /></div>
        <div data-automation-id="formField-endDate"><input data-automation-id="dateSectionMonth-input" aria-label="Month" /><input data-automation-id="dateSectionYear-input" aria-label="Year" /></div>
        <div data-automation-id="formField-roleDescription"><textarea></textarea></div>
      </div>
    </section>`;
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <h3>Work Experience</h3>
        ${splitWorkRow}
      </main>`);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Analyst (Product)",
            company: "ION Group",
            location: "Hyderabad, India",
            startDate: "2021-10",
            endDate: "2026-03",
            current: false,
            bullets: ["Owned RAG workflow"],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    const row = document.querySelector<HTMLElement>("[data-row='work']") as HTMLElement;
    expect(input(row, "[data-automation-id='formField-jobTitle'] input")?.value).toBe("Analyst (Product)");
    expect(input(row, "[data-automation-id='formField-companyName'] input")?.value).toBe("ION Group");
    expect(input(row, "[data-automation-id='formField-location'] input")?.value).toBe("Hyderabad, India");
    expect(input(row, "[data-automation-id='formField-startDate'] [data-automation-id='dateSectionMonth-input']")?.value).toBe("10");
    expect(input(row, "[data-automation-id='formField-startDate'] [data-automation-id='dateSectionYear-input']")?.value).toBe("2021");
    expect(input(row, "[data-automation-id='formField-endDate'] [data-automation-id='dateSectionMonth-input']")?.value).toBe("03");
    expect(input(row, "[data-automation-id='formField-endDate'] [data-automation-id='dateSectionYear-input']")?.value).toBe("2026");
    expect((row.querySelector("[data-automation-id='formField-roleDescription'] textarea") as HTMLTextAreaElement).value).toBe(
      "Owned RAG workflow",
    );
  });

  it("fills the first Workday education row before clicking Add Another for the second", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <h3>Education</h3>
        ${EDUCATION_ROW_TEMPLATE}
        <button type="button">Add Another</button>
      </main>`);
    const addButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.trim() === "Add Another",
    ) as HTMLElement;
    addButton.addEventListener("click", () => {
      const firstRow = document.querySelector("[data-row='education']") as HTMLElement;
      if (!input(firstRow, "[data-automation-id='formField-schoolName'] input")?.value) return;
      const holder = document.createElement("div");
      holder.innerHTML = EDUCATION_ROW_TEMPLATE;
      addButton.parentElement?.insertBefore(holder.firstElementChild as HTMLElement, addButton);
    });

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [],
        education: [
          { school: "Stanford University" },
          { school: "Massachusetts Institute of Technology" },
        ],
        skills: [],
      }),
    );

    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-row='education']"));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => input(row, "[data-automation-id='formField-schoolName'] input")?.value)).toEqual([
      "Stanford University",
      "Massachusetts Institute of Technology",
    ]);
  }, 15000);

  it("waits for delayed text-only Add Another buttons and fills the second work experience", async () => {
    const { document } = setupExperienceDom(blankHtml());
    const workButton = document.querySelector<HTMLElement>("[data-section='work']") as HTMLElement;
    const workClicks = wireDelayedTextAddButton(document, workButton, WORK_ROW_TEMPLATE, 1800);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Analyst (Product)",
            company: "ION Group",
            location: "Hyderabad, India",
            startDate: "2021-10",
            endDate: "2026-03",
            current: false,
            bullets: [],
          },
          {
            title: "Product Intern",
            company: "Acme Labs",
            location: "Remote",
            startDate: "2020-01",
            endDate: "2021-09",
            current: false,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    const workRows = Array.from(document.querySelectorAll<HTMLElement>("[data-row='work']"));
    expect(workRows).toHaveLength(2);
    expect(workRows.map((row) => input(row, "[data-automation-id='formField-jobTitle'] input")?.value)).toEqual([
      "Analyst (Product)",
      "Product Intern",
    ]);
    expect(workRows.map((row) => input(row, "[data-automation-id='formField-location'] input")?.value)).toEqual([
      "Hyderabad, India",
      "Remote",
    ]);
    expect(workClicks()).toBe(2);
  }, 20000);

  it("does not type suspicious metadata fragments into Workday work location", async () => {
    const { document } = setupBlank();

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        location: { ...baseProfile.location, city: "Hyderabad", country: "India" },
        experience: [
          {
            title: "Analyst (Product)",
            company: "ION Group",
            location: "Platform, Tier",
            startDate: "2021-10",
            endDate: "2026-03",
            current: false,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    const work = document.querySelector("[data-row='work']") as HTMLElement;
    expect(input(work, "[data-automation-id='formField-location'] input")?.value).toBe("Hyderabad, India");
  });

  it("commits Workday-controlled text and date fields after filling them", async () => {
    const { document } = setupExperienceDom(blankHtml());
    const workButton = document.querySelector<HTMLElement>("[data-section='work']") as HTMLElement;
    const recognized = new Set<string>();
    wireAddButton(document, workButton, WORK_ROW_TEMPLATE, (row) => wireWorkExperienceRecognition(row, recognized));

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Analyst (Product)",
            company: "ION Group",
            location: "Hyderabad, India",
            startDate: "2021-10",
            endDate: "2026-03",
            current: false,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    expect(Array.from(recognized).sort()).toEqual([
      "company",
      "from-month",
      "from-year",
      "title",
      "to-month",
      "to-year",
    ]);
  });

  it("re-commits already-visible work row values instead of skipping the row", async () => {
    const { document } = setupExperienceDom(`<!doctype html>
      <div data-automation-id="progressBarActiveStep">My Experience</div>
      <main data-automation-id="applyFlowMyExpPage">
        <h3>Work Experience</h3>
        ${WORK_ROW_TEMPLATE}
        <button type="button">Add Another</button>
      </main>`);
    const row = document.querySelector("[data-row='work']") as HTMLElement;
    input(row, "[data-automation-id='formField-jobTitle'] input")!.value = "Analyst (Product)";
    input(row, "[data-automation-id='formField-companyName'] input")!.value = "ION Group";
    input(row, "[data-automation-id='formField-startDate'] [data-automation-id='dateSectionMonth-input']")!.value = "10";
    input(row, "[data-automation-id='formField-startDate'] [data-automation-id='dateSectionYear-input']")!.value = "2021";
    input(row, "[data-automation-id='formField-endDate'] [data-automation-id='dateSectionMonth-input']")!.value = "03";
    input(row, "[data-automation-id='formField-endDate'] [data-automation-id='dateSectionYear-input']")!.value = "2026";
    const recognized = new Set<string>();
    wireWorkExperienceRecognition(row, recognized);

    await fillWorkdayExperience(
      context({
        ...baseProfile,
        experience: [
          {
            title: "Analyst (Product)",
            company: "ION Group",
            location: "Hyderabad, India",
            startDate: "2021-10",
            endDate: "2026-03",
            current: false,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      }),
    );

    expect(Array.from(recognized).sort()).toEqual([
      "company",
      "from-month",
      "from-year",
      "title",
      "to-month",
      "to-year",
    ]);
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
