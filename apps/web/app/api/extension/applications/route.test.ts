import { describe, expect, it } from "vitest";
import type { ExtensionApplicationUpsert } from "@jobposted/shared";
import {
  buildExtensionApplicationRow,
  type ExistingExtensionApplicationRow,
} from "@/lib/extension/application-sync";

const payload: ExtensionApplicationUpsert = {
  source: "extension",
  platform: "greenhouse",
  company: "Acme",
  role: "Product Engineer",
  jobUrl: "https://boards.greenhouse.io/acme/jobs/1",
  status: "filled",
  appliedAt: "2026-06-17T10:00:00.000Z",
  fieldsFilled: [],
};

const existing: ExistingExtensionApplicationRow = {
  id: "app_1",
  job_id: "job_1",
  status: "ready_for_review",
  resume_doc_id: "doc_tailored",
  cover_letter_doc_id: null,
  field_map: {
    source: "server",
    resumeUsed: "user_1/tailored/job_1.pdf",
    genericResumeUsed: false,
  },
  screenshot_path: "screenshots/app_1.png",
  base_version_id: "base_1",
  resume_variant_id: null,
  tailoring_delta: { matchScore: 91 },
  rendered_pdf_path: "user_1/tailored/job_1.pdf",
  submitted_at: null,
};

describe("buildExtensionApplicationRow", () => {
  it("preserves existing tailored resume artifacts when extension sync has no resume", () => {
    const row = buildExtensionApplicationRow({
      userId: "user_1",
      jobId: "job_1",
      payload,
      jobUrl: payload.jobUrl,
      company: payload.company,
      role: payload.role,
      activeResumeVersionId: "base_latest",
      existingApplication: existing,
    });

    expect(row.resume_doc_id).toBe("doc_tailored");
    expect(row.rendered_pdf_path).toBe("user_1/tailored/job_1.pdf");
    expect(row.tailoring_delta).toEqual({ matchScore: 91 });
    expect(row.base_version_id).toBe("base_1");
    expect(row.field_map).toMatchObject({
      source: "extension",
      resumeUsed: "user_1/tailored/job_1.pdf",
      genericResumeUsed: false,
      fieldsFilled: [],
    });
  });

  it("does not downgrade an already submitted application to filled", () => {
    const row = buildExtensionApplicationRow({
      userId: "user_1",
      jobId: "job_1",
      payload,
      jobUrl: payload.jobUrl,
      company: payload.company,
      role: payload.role,
      activeResumeVersionId: "base_latest",
      existingApplication: { ...existing, status: "submitted", submitted_at: "2026-06-16T10:00:00.000Z" },
    });

    expect(row.status).toBe("submitted");
    expect(row.submitted_at).toBe("2026-06-16T10:00:00.000Z");
  });
});
