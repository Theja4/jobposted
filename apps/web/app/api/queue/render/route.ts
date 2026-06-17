import { NextResponse } from "next/server";
import type { ResumeContent } from "@jobposted/shared";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { loadBaseResume } from "@/lib/tailor/source";
import { tailorResume } from "@/lib/tailor/engine";
import { renderResumePdf } from "@/lib/tailor/pdf";
import { getUsageStatus } from "@/lib/billing/limits";
import { reportError } from "@/lib/observability/report";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Renders the per-application resume PDF for auto-queued (`server`) applications that don't have an
 * artifact yet, so the apply runner submits the *tailored* resume instead of falling back to the
 * master. Tailoring-enabled rows must actually tailor; if the gateway/JD/base resume is missing,
 * the row is moved to review instead of silently rendering the base resume. Idempotent — only
 * touches `queued` rows with `rendered_pdf_path IS NULL`. Cron-authorized;
 * called by the worker between queue-prep and the apply runner.
 */

function cronAuthorized(request: Request) {
  const secret = process.env.WORKER_CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isExplicitFalse(value: unknown) {
  return value === false || (typeof value === "string" && value.trim().toLowerCase() === "false");
}

type PendingRow = {
  id: string;
  user_id: string;
  job_id: string;
  base_version_id: string | null;
  field_map: unknown;
};

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const service = getServiceRoleClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "service_role_unavailable" }, { status: 503 });
  }
  const serviceClient = service;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const defaultLimit = Number(process.env.QUEUE_RENDER_LIMIT ?? process.env.APPLY_BATCH ?? 50) || 50;
  const limit = Math.min(50, Math.max(1, Number(body?.limit ?? defaultLimit) || defaultLimit));

  const { data, error } = await serviceClient
    .from("applications")
    .select("id,user_id,job_id,base_version_id,field_map")
    .eq("apply_path", "server")
    .eq("status", "queued")
    .is("rendered_pdf_path", null)
    .limit(limit);
  if (error) {
    await reportError("queue render pending read failed", error);
    return NextResponse.json({ ok: false, error: "pending_read_failed" }, { status: 500 });
  }

  const rows = (Array.isArray(data) ? data : []) as PendingRow[];
  const gateway = gatewayConfigured();
  let rendered = 0;
  let tailored = 0;
  const errors: Array<{ id: string; reason: string }> = [];

  async function markReadyForReview(id: string, reason: string) {
    const { error } = await serviceClient
      .from("applications")
      .update({ status: "ready_for_review", failure_reason: reason })
      .eq("id", id);
    if (error) {
      errors.push({ id, reason: `review_mark_failed: ${error.message}` });
      return;
    }
    errors.push({ id, reason });
  }

  // Sequential: tailoring is an LLM call; small bounded batch per tick avoids hammering the gateway.
  for (const row of rows) {
    try {
      const usage = await getUsageStatus(serviceClient, row.user_id);
      if (!usage.canSubmit) {
        if (usage.reason === "subscription_inactive") {
          await markReadyForReview(row.id, "subscription_inactive");
        } else {
          errors.push({ id: row.id, reason: usage.reason });
        }
        continue;
      }

      const base = await loadBaseResume(serviceClient, row.user_id, row.base_version_id);
      if (!base) {
        await markReadyForReview(row.id, "no_base_resume");
        continue;
      }

      const tailoringEnabled = !isExplicitFalse(asRecord(row.field_map).tailoringEnabled);
      const { data: job } = await serviceClient.from("jobs").select("description_md").eq("id", row.job_id).maybeSingle();
      const description = typeof asRecord(job).description_md === "string" ? (asRecord(job).description_md as string) : "";

      let resume: ResumeContent = base;
      if (tailoringEnabled) {
        if (!gateway) {
          await markReadyForReview(row.id, "tailor_gateway_unavailable");
          continue;
        }
        if (wordCount(description) < 20) {
          await markReadyForReview(row.id, "job_description_missing_for_tailoring");
          continue;
        }
        try {
          resume = (await tailorResume(base, description.slice(0, 25000))).resume;
          tailored += 1;
        } catch (tailorErr) {
          await reportError("queue render tailor failed", tailorErr, { applicationId: row.id });
          await markReadyForReview(row.id, "tailor_failed");
          continue;
        }
      }

      const pdf = await renderResumePdf(resume);
      const storagePath = `${row.user_id}/tailored/${row.job_id}.pdf`;
      const { error: uploadError } = await serviceClient.storage
        .from("resumes")
        .upload(storagePath, new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
          upsert: true,
          contentType: "application/pdf",
        });
      if (uploadError) {
        errors.push({ id: row.id, reason: `upload_failed: ${uploadError.message}` });
        continue;
      }

      // Reuse the per-job document row if one exists.
      const { data: existing } = await serviceClient
        .from("documents")
        .select("id")
        .eq("user_id", row.user_id)
        .eq("job_id", row.job_id)
        .eq("type", "tailored_resume")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let documentId: string | null = null;
      if (existing?.id) {
        await serviceClient.from("documents").update({ storage_path: storagePath }).eq("id", existing.id);
        documentId = existing.id;
      } else {
        const { data: inserted } = await serviceClient
          .from("documents")
          .insert({ user_id: row.user_id, job_id: row.job_id, type: "tailored_resume", storage_path: storagePath })
          .select("id")
          .single();
        documentId = inserted?.id ?? null;
      }

      const { error: pinError } = await serviceClient
        .from("applications")
        .update({ rendered_pdf_path: storagePath, resume_doc_id: documentId })
        .eq("id", row.id);
      if (pinError) {
        errors.push({ id: row.id, reason: `pin_failed: ${pinError.message}` });
        continue;
      }
      rendered += 1;
    } catch (err) {
      errors.push({ id: row.id, reason: err instanceof Error ? err.message : "render_failed" });
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, rendered, tailored, errors });
}
