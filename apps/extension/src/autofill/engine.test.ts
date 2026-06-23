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
});
