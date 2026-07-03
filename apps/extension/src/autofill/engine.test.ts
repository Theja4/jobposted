import { DEFAULT_EXTENSION_SETTINGS, type ExtensionFieldFillRecord, type MasterProfile } from "@jobposted/shared";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { fillCurrentStep } from "./engine";
import type { PlatformAdapter } from "./types";

function installDom(html = "<!doctype html><main></main>") {
  const { document, window } = parseHTML(html);
  Object.defineProperty(window, "location", {
    value: { href: "https://acme.myworkdayjobs.com/job/apply" },
    configurable: true,
  });
  Object.assign(globalThis, {
    window,
    document,
    Event: window.Event,
    FocusEvent: window.FocusEvent ?? window.Event,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLSelectElement: window.HTMLSelectElement,
  });
}

const profile: MasterProfile = {
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
  education: [],
  skills: [],
  answers: [],
  documents: {},
};

describe("fillCurrentStep", () => {
  it("keeps adapter extra records in the returned result", async () => {
    installDom();
    const extra: ExtensionFieldFillRecord = {
      signature: "workday-extra-skills",
      label: "Skills",
      canonicalKey: "skills",
      confidence: 0.9,
      source: "adapter",
      status: "filled",
      valuePreview: "TypeScript",
    };
    const seen: ExtensionFieldFillRecord[] = [];
    const adapter: PlatformAdapter = {
      id: "workday",
      label: "Workday",
      match: () => true,
      detectStep: () => ({ name: "My Experience" }),
      mapFields: () => [],
      fillExtras: async (context) => {
        context.onField(extra);
      },
      findAdvance: () => null,
      findSubmit: () => null,
      notes: "",
    };

    const result = await fillCurrentStep({
      adapter,
      profile,
      settings: DEFAULT_EXTENSION_SETTINGS,
      onField: (record) => seen.push(record),
    });

    expect(seen).toEqual([extra]);
    expect(result.fields).toEqual([extra]);
    expect(result.total).toBe(1);
    expect(result.filled).toBe(1);
  });

  it("waits briefly for delayed application fields before declaring a page empty", async () => {
    installDom("<!doctype html><form id=\"application\"></form>");
    const seen: ExtensionFieldFillRecord[] = [];
    const adapter: PlatformAdapter = {
      id: "lever",
      label: "Lever",
      match: () => true,
      detectStep: () => ({ name: "Apply" }),
      mapFields: () => [{ selector: "input[name='name']", key: "identity.fullName", confidence: 0.98 }],
      findAdvance: () => null,
      findSubmit: () => null,
      notes: "",
    };
    window.setTimeout(() => {
      const form = document.getElementById("application");
      if (form) form.innerHTML = `<label>Full name <input name="name" /></label>`;
    }, 50);

    const result = await fillCurrentStep({
      adapter,
      profile,
      settings: DEFAULT_EXTENSION_SETTINGS,
      onField: (record) => seen.push(record),
    });

    expect(result.total).toBe(1);
    expect(result.filled).toBe(1);
    expect(seen[0]?.canonicalKey).toBe("identity.fullName");
    expect((document.querySelector("input[name='name']") as HTMLInputElement | null)?.value).toBe("Asha Raman");
  });

  it("fills live-shaped Lever D&B fields and native radio groups", async () => {
    installDom(`<!doctype html>
      <form class="application">
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Full name<span class="required">✱</span></div></div>
          <div class="application-field full-width required-field"><input name="name" required /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Email<span class="required">✱</span></div></div>
          <div class="application-field full-width required-field"><input name="email" type="email" required /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Phone <span class="required">✱</span></div></div>
          <div class="application-field full-width required-field"><input name="phone" required /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Current location <span class="required">✱</span></div></div>
          <div class="application-field full-width required-field"><input name="location" /></div>
        </li>
        <li class="application-question">
          <div class="application-label full-width text"><div class="text">Current company</div></div>
          <div class="application-field full-width"><input name="org" /></div>
        </li>
        <li class="application-question custom-question">
          <div class="application-label full-width multiple-choice">
            <div class="text">Are you a current or previous employee of Dun &amp; Bradstreet?<span class="required">✱</span></div>
          </div>
          <div class="application-field full-width required-field">
            <ul data-qa="multiple-choice">
              <li><label><input type="radio" name="cards[dnb][field0]" value="No previous work experience with the company" required /><span>No previous work experience with the company</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field0]" value="Current employee or intern" required /><span>Current employee or intern</span></label></li>
            </ul>
          </div>
        </li>
        <li class="application-question custom-question">
          <div class="application-label full-width multiple-choice">
            <div class="text">Do you have a family member or relative who is currently employed by Dun &amp; Bradstreet?<span class="required">✱</span></div>
          </div>
          <div class="application-field full-width required-field">
            <ul data-qa="multiple-choice">
              <li><label><input type="radio" name="cards[dnb][field1]" value="Yes" required /><span>Yes</span></label></li>
              <li><label><input type="radio" name="cards[dnb][field1]" value="No" required /><span>No</span></label></li>
            </ul>
          </div>
        </li>
      </form>`);
    Object.defineProperty(window, "location", {
      value: { href: "https://jobs.lever.co/dnb/8eb0cdd5-1bf4-4865-9e84-7db8ec89fba2/apply" },
      configurable: true,
    });
    const seen: ExtensionFieldFillRecord[] = [];
    const adapter: PlatformAdapter = {
      id: "lever",
      label: "Lever",
      match: () => true,
      detectStep: () => ({ name: "Apply" }),
      mapFields: () => [
        { selector: "input[name='name']", key: "identity.fullName", confidence: 0.98 },
        { selector: "input[name='email']", key: "identity.email", confidence: 0.98 },
        { selector: "input[name='phone']", key: "identity.phone", confidence: 0.96 },
      ],
      findAdvance: () => null,
      findSubmit: () => null,
      notes: "",
    };
    const leverProfile: MasterProfile = {
      ...profile,
      location: { city: "Hyderabad", country: "India" },
      experience: [{ title: "Engineer", company: "Current Co", startDate: "2024-01", endDate: null, current: true, bullets: [] }],
    };

    const result = await fillCurrentStep({
      adapter,
      profile: leverProfile,
      settings: DEFAULT_EXTENSION_SETTINGS,
      onField: (record) => seen.push(record),
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.filled).toBeGreaterThanOrEqual(7);
    expect((document.querySelector("input[name='name']") as HTMLInputElement | null)?.value).toBe("Asha Raman");
    expect((document.querySelector("input[name='email']") as HTMLInputElement | null)?.value).toBe("asha@example.com");
    expect((document.querySelector("input[name='location']") as HTMLInputElement | null)?.value).toBe("Hyderabad");
    expect((document.querySelector("input[name='org']") as HTMLInputElement | null)?.value).toBe("Current Co");
    expect((document.querySelector("input[value='No previous work experience with the company']") as HTMLInputElement | null)?.checked).toBe(true);
    expect((document.querySelector("input[name='cards[dnb][field1]'][value='No']") as HTMLInputElement | null)?.checked).toBe(true);
    expect(seen.some((record) => record.label.includes("Dun & Bradstreet") && record.status === "filled")).toBe(true);
  });
});
