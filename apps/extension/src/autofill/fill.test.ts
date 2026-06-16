import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import type { ExtensionFieldMapping, MasterProfile } from "@jobposted/shared";
import { fillField } from "./fill";
import type { FieldDescriptor, FillContext } from "./types";

function fileField(required = true): FieldDescriptor {
  const { document, window } = parseHTML(`<input id="resume" type="file" ${required ? "required" : ""} />`);
  Object.assign(globalThis, {
    window,
    document,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
  });
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
  profile: {} as MasterProfile,
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
