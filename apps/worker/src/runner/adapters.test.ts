import { describe, expect, it } from "vitest";
import { greenhouseAdapter, pickAdapter } from "./adapters.js";
import type { AdapterContext } from "./types.js";

describe("pickAdapter", () => {
  it("supports Ashby as a server-safe adapter", () => {
    const adapter = pickAdapter("", "https://jobs.ashbyhq.com/acme/123");
    expect(adapter?.id).toBe("ashby");
    expect(adapter?.risk).toBe("server_safe");
  });

  it("recognizes risky ATS flows as review-only", () => {
    const adapter = pickAdapter("workday", "https://acme.wd1.myworkdayjobs.com/jobs/123");
    expect(adapter?.id).toBe("workday");
    expect(adapter?.risk).toBe("review_only");
  });

  it("routes post-submit captcha challenges to review", async () => {
    let clickedSubmit = false;
    const validSelectors = new Set([
      "#name",
      "#email",
      "input[type='file']#resume",
      "#submit_app",
      "button#submit_app",
      "button:has-text('Submit Application')",
      "button[type='submit']",
    ]);
    const page = {
      async goto() {},
      locator(selector: string) {
        return {
          async count() {
            return validSelectors.has(selector) || selector.includes("#submit_app") ? 1 : 0;
          },
          async innerText() {
            return clickedSubmit ? "Please complete this captcha to continue." : "Apply for this role";
          },
          first() {
            return {
              async fill() {},
              async setInputFiles() {},
              async click() {
                clickedSubmit = true;
              },
              async waitFor() {
                throw new Error("confirmation missing");
              },
            };
          },
        };
      },
      async evaluate() {
        return [];
      },
      async screenshot() {
        return new Uint8Array([9]);
      },
    };
    const ctx = {
      jobUrl: "https://boards.greenhouse.io/acme/jobs/1",
      job: {
        id: "app_1",
        userId: "user_1",
        jobId: "job_1",
        fieldMap: {},
        baseVersionId: null,
        resumeVariantId: null,
        renderedPdfPath: null,
        attempts: 1,
      },
      applicant: {
        fullName: "Test User",
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        phone: "",
        location: "",
        linkedin: "",
        portfolio: "",
        github: "",
      },
      resume: {
        path: "resume.pdf",
        bytes: new Uint8Array([1]),
        filename: "resume.pdf",
        contentType: "application/pdf",
      },
      dryRun: false,
      log() {},
    } satisfies AdapterContext;

    await expect(greenhouseAdapter.submit(page, ctx)).resolves.toMatchObject({
      status: "failed",
      reason: "captcha_required",
      permanent: true,
    });
  });
});
