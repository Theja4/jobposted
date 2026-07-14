import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import {
  hasWorkdayDom,
  detectWorkdayAccountGate,
  isWorkdayHost,
  isWorkdayPage,
  prefillWorkdayGateEmail,
  workdayCompany,
  ensureWorkdayRepeaterRows,
  fillWorkdaySkills,
  workdayApplyFlowPresent,
  workdayJobHeading,
  workdayRepeaterHint,
  workdayStepName,
} from "./workday";

function documentFrom(html: string) {
  const { document, window } = parseHTML(html);
  Object.assign(globalThis, {
    window,
    document,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent ?? window.Event,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
  });
  return document;
}

describe("Workday content helpers", () => {
  it("recognizes Workday tenant hosts and DOM markers", () => {
    const doc = documentFrom(`<form data-automation-id="workdayApplication"></form>`);

    expect(isWorkdayHost("acme.wd1.myworkdayjobs.com")).toBe(true);
    expect(isWorkdayHost("jobs.example.com")).toBe(false);
    expect(hasWorkdayDom(doc)).toBe(true);
    expect(isWorkdayPage("https://jobs.example.com/apply", doc)).toBe(true);
  });

  it("reads Workday step and job metadata from named selectors", () => {
    const doc = documentFrom(`<!doctype html>
      <main>
        <h1 data-automation-id="jobPostingHeader">Senior Engineer</h1>
        <span data-automation-id="company">Acme</span>
        <h2 data-automation-id="stepName">My Information</h2>
      </main>`);

    expect(workdayStepName(doc)).toBe("My Information");
    expect(workdayJobHeading(doc)).toBe("Senior Engineer");
    expect(workdayCompany(doc)).toBe("Acme");
  });

  it("detects the Workday sign-in/create-account gate and can prefill email only", () => {
    const doc = documentFrom(`<!doctype html>
      <main data-automation-id="candidateHome">
        <h1>Sign in to continue your application</h1>
        <label for="email">Email Address</label>
        <input id="email" data-automation-id="email" autocomplete="email" />
        <label for="password">Password</label>
        <input id="password" data-automation-id="password" type="password" />
        <button data-automation-id="signInSubmitButton">Sign In</button>
        <button data-automation-id="createAccountLink">Create Account</button>
      </main>`);

    const gate = detectWorkdayAccountGate(doc, "https://acme.wd5.myworkdayjobs.com/en-US/jobs/login");

    expect(gate).toBeTruthy();
    expect(gate?.hasSignIn).toBe(true);
    expect(gate?.hasCreateAccount).toBe(true);
    expect(prefillWorkdayGateEmail(doc, "asha@example.com", "https://acme.wd5.myworkdayjobs.com/en-US/jobs/login")).toBe(true);
    expect((doc.querySelector("#email") as HTMLInputElement).value).toBe("asha@example.com");
    expect((doc.querySelector("#password") as HTMLInputElement).value).toBe("");
  });

  it("does not classify an active Workday apply flow as an account gate", () => {
    const doc = documentFrom(`<!doctype html>
      <main data-automation-id="workdayApplication">
        <div data-automation-id="progressBarActiveStep">My Information</div>
        <div data-automation-id="email"><input type="email" /></div>
        <button data-automation-id="pageFooterNextButton">Save and Continue</button>
      </main>`);

    expect(workdayApplyFlowPresent(doc)).toBe(true);
    expect(detectWorkdayAccountGate(doc, "https://acme.wd5.myworkdayjobs.com/jobs/apply")).toBeNull();
  });

  it("exposes the auto-resume condition when the gate clears", () => {
    const doc = documentFrom(`<!doctype html>
      <main>
        <input id="email" autocomplete="email" />
        <input id="password" type="password" />
        <button>Create Account</button>
      </main>`);

    expect(detectWorkdayAccountGate(doc, "https://acme.wd5.myworkdayjobs.com/jobs/login")).toBeTruthy();
    doc.body.innerHTML = `
      <main data-automation-id="workdayApplication">
        <div data-automation-id="progressBarActiveStep">My Information</div>
        <button data-automation-id="pageFooterNextButton">Save and Continue</button>
      </main>`;

    expect(workdayApplyFlowPresent(doc)).toBe(true);
    expect(detectWorkdayAccountGate(doc, "https://acme.wd5.myworkdayjobs.com/jobs/apply")).toBeNull();
  });

  it("keeps Workday repeater detection close to automation ids", () => {
    const doc = documentFrom(`<!doctype html>
      <div data-automation-id="education-1-school">
        <label for="school">School</label>
        <input id="school" />
      </div>
      <div data-automation-id="employment-1-jobTitle">
        <label for="title">Job Title</label>
        <input id="title" />
      </div>`);

    expect(workdayRepeaterHint(doc.querySelector("#school") as HTMLElement)).toBe("education");
    expect(workdayRepeaterHint(doc.querySelector("#title") as HTMLElement)).toBe("experience");
  });

  it("adds Workday education repeater rows through section-local Add buttons", async () => {
    const doc = documentFrom(`<!doctype html>
      <section data-automation-id="educationSection">
        <h2>Education</h2>
        <div data-automation-id="formField-schoolName"><input id="school-1" /></div>
        <button type="button" data-automation-id="add-button">Add Another Education</button>
      </section>`);
    doc.querySelector("button")?.addEventListener("click", () => {
      const row = doc.createElement("div");
      row.setAttribute("data-automation-id", "formField-schoolName");
      row.innerHTML = `<input id="school-2" />`;
      doc.querySelector("section")?.append(row);
    });

    await ensureWorkdayRepeaterRows({ doc, intent: "education", desiredRows: 2 });

    expect(doc.querySelector("#school-2")).toBeTruthy();
  });

  it("commits Workday skill chips through the typeahead input", async () => {
    const doc = documentFrom(`<!doctype html>
      <div data-automation-id="formField-skills">
        <div data-automation-id="multiSelectContainer">
          <div data-automation-id="multiselectInputContainer"><input id="skills" /></div>
        </div>
      </div>`);
    const root = doc.querySelector("[data-automation-id='multiSelectContainer']") as HTMLElement;
    const input = doc.querySelector("#skills") as HTMLInputElement;
    input.addEventListener("keydown", () => {
      if (!input.value.trim()) return;
      const chip = doc.createElement("span");
      chip.textContent = input.value;
      root.append(chip);
    });

    const result = await fillWorkdaySkills({
      field: { element: input, label: "Skills" },
      value: ["TypeScript", "React"],
    });

    expect(result).toEqual({ filled: 2, attempted: 2 });
    expect(root.textContent).toContain("TypeScript");
    expect(root.textContent).toContain("React");
  });
});
