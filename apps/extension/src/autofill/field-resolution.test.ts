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

  it("maps Greenhouse core fields", async () => {
    const { adapter, fields } = await loadFixture("greenhouse", "https://boards.greenhouse.io/acme/jobs/1");
    expect(adapter.id).toBe("greenhouse");
    const labels = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(labels.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.firstName", "identity.lastName", "identity.email", "identity.phone", "documents.resume"]),
    );
  });

  it("maps Lever full name and links", async () => {
    const { adapter, fields } = await loadFixture("lever", "https://jobs.lever.co/acme/1");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.fullName", "identity.email", "links.linkedin", "documents.resume"]),
    );
  });

  it("maps Ashby named inputs", async () => {
    const { adapter, fields } = await loadFixture("ashby", "https://jobs.ashbyhq.com/acme/1");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.firstName", "identity.lastName", "identity.email", "identity.phone", "documents.resume"]),
    );
  });

  it("uses generic heuristics and reusable answers", async () => {
    const { adapter, fields } = await loadFixture("generic", "https://careers.example.com/apply");
    expect(adapter.id).toBe("generic");
    const mappings = await Promise.all(fields.map((field) => resolveField({ field, profile, platform: adapter.id, url: "", demographicsEnabled: false })));
    expect(mappings.map((mapping) => mapping.canonicalKey)).toEqual(
      expect.arrayContaining(["identity.firstName", "identity.lastName", "identity.email", "workAuth.requiresSponsorship", "answers.why_company"]),
    );
  });
});
