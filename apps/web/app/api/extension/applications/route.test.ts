import { describe, expect, it } from "vitest";
import type { ExtensionApplicationUpsert } from "@jobposted/shared";
import {
  buildExtensionApplicationRow,
  canonicalizeJobUrl,
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

describe("canonicalizeJobUrl", () => {
  it("treats the same posting opened from different referrers as one URL", () => {
    const a = canonicalizeJobUrl("https://boards.greenhouse.io/acme/jobs/1?utm_source=linkedin&gh_src=abc123");
    const b = canonicalizeJobUrl("https://boards.greenhouse.io/acme/jobs/1#app");
    expect(a).toBe(b);
  });

  it("preserves job-identifying query params like gh_jid", () => {
    expect(canonicalizeJobUrl("https://job-boards.greenhouse.io/embed/job_app?gh_jid=42&utm_medium=email")).toBe(
      "https://job-boards.greenhouse.io/embed/job_app?gh_jid=42",
    );
  });

  it("normalizes host case and a trailing slash but keeps distinct jobs distinct", () => {
    expect(canonicalizeJobUrl("https://Jobs.Lever.co/acme/123/")).toBe("https://jobs.lever.co/acme/123");
    expect(canonicalizeJobUrl("https://jobs.lever.co/acme/124")).not.toBe(
      canonicalizeJobUrl("https://jobs.lever.co/acme/123"),
    );
  });

  it("returns non-URL input untouched", () => {
    expect(canonicalizeJobUrl("not a url")).toBe("not a url");
    expect(canonicalizeJobUrl("")).toBe("");
  });
});

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

  it("can build a tracker application row even when no job row was created", () => {
    const row = buildExtensionApplicationRow({
      userId: "user_1",
      jobId: null,
      payload,
      jobUrl: payload.jobUrl,
      company: payload.company,
      role: payload.role,
      activeResumeVersionId: "base_latest",
      existingApplication: null,
    });

    expect(row.job_id).toBeNull();
    expect(row.field_map).toMatchObject({
      source: "extension",
      company: "Acme",
      role: "Product Engineer",
      jobUrl: "https://boards.greenhouse.io/acme/jobs/1",
    });
  });
});
