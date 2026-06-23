import type { MasterProfile } from "@jobposted/shared";
import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FillContext } from "../autofill/types";
import { workdayAdapter } from "./workday";

const nativeFetch = globalThis.fetch;

function installDom(html: string) {
  const { document, window } = parseHTML(html);
  Object.assign(globalThis, {
    window,
    document,
    Event: window.Event,
    FocusEvent: window.FocusEvent ?? window.Event,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLSelectElement: window.HTMLSelectElement,
    KeyboardEvent: window.KeyboardEvent ?? window.Event,
    MouseEvent: window.MouseEvent ?? window.Event,
    PointerEvent: window.PointerEvent,
  });
  return { document, window };
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

afterEach(() => {
  globalThis.fetch = nativeFetch;
  vi.restoreAllMocks();
});

describe("workdayAdapter.fillExtras", () => {
  it("attaches a resume to hidden Workday drop-zone file inputs", async () => {
    const { document } = installDom(`<!doctype html>
      <form data-automation-id="workdayApplication">
        <div data-automation-id="resumeUpload">
          <div data-automation-id="fieldLabel">Resume/CV</div>
          <button type="button">Select files</button>
          <input data-automation-id="file-upload-input-ref" type="file" style="display:none" />
        </div>
      </form>`);
    globalThis.fetch = vi.fn(async () =>
      new Response(new Blob(["resume"], { type: "application/pdf" }), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="Asha Resume.pdf"',
        },
      }),
    ) as typeof fetch;
    const records: Array<Parameters<FillContext["onField"]>[0]> = [];

    await workdayAdapter.fillExtras?.({
      profile,
      platform: "workday",
      url: "https://acme.wd5.myworkdayjobs.com/jobs/job/1",
      overwrite: false,
      demographicsEnabled: false,
      getResume: async () => ({ resumeUrl: "https://files.example.com/resume.pdf" }),
      onField: (record) => records.push(record),
      llmMap: async () => null,
    });

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    expect(input.files?.item(0)?.name).toBe("Asha Resume.pdf");
    expect(records).toEqual([
      expect.objectContaining({
        canonicalKey: "documents.resume",
        status: "filled",
        valuePreview: "Asha Resume.pdf",
      }),
    ]);
  });
});
