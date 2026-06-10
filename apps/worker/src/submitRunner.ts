import type { FieldMap } from "@jobposted/shared";
import { newContext } from "./browser";
import { pickHandler } from "./handlers";
import { extractFields } from "./extract";
import { fillForm } from "./fill";
import { detectChallenge } from "./captcha";
import { getBaseResume } from "./storage";
import {
  countSubmittedToday,
  dailyLimitFor,
  setStatus,
  type ClaimedApplication,
  type JobRow,
} from "./queue";
import { log } from "./logger";

/**
 * Submit a user-confirmed application (design doc §11.1). Re-opens, re-fills from the saved
 * field map, gates on the daily cap, then submits and verifies.
 */
export async function runSubmit(app: ClaimedApplication, job: JobRow): Promise<void> {
  const fieldMap = app.field_map as FieldMap | null;
  if (!fieldMap || !job.apply_url) {
    await setStatus(app.id, "failed", { failure_reason: "missing field_map or apply_url" });
    return;
  }

  // Daily cap gate (design doc §12).
  const [submittedToday, cap] = await Promise.all([
    countSubmittedToday(app.user_id),
    dailyLimitFor(app.user_id),
  ]);
  if (submittedToday >= cap) {
    await setStatus(app.id, "ready_for_review", {
      failure_reason: "daily_cap_reached",
      claimed_at: null,
    });
    log.warn("daily cap reached; holding for tomorrow", { id: app.id, submittedToday, cap });
    return;
  }

  const resume = await getBaseResume(app.user_id);
  const context = await newContext();
  const page = await context.newPage();
  try {
    const handler = pickHandler(job.apply_url);
    await handler.gotoForm(page, job.apply_url);

    if (await detectChallenge(page)) {
      await setStatus(app.id, "failed", { failure_reason: "challenge_on_submit" });
      return;
    }

    const fields = await extractFields(page, handler.formSelector);
    await fillForm(page, fieldMap, fields, resume);

    let clicked = false;
    for (const sel of handler.submitSelectors) {
      const btn = page.locator(sel).first();
      if ((await btn.count()) > 0) {
        await btn.click().catch(() => {});
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      await setStatus(app.id, "failed", { failure_reason: "submit button not found" });
      return;
    }

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    if (await handler.submitted(page)) {
      await setStatus(app.id, "submitted", {
        submitted_at: new Date().toISOString(),
        failure_reason: null,
      });
      log.info("submitted", { id: app.id });
      // Fire-and-forget submission-confirmation email via the web app (gated on env).
      const webUrl = process.env.WEB_URL;
      const emailToken = process.env.EMAIL_SERVICE_TOKEN;
      if (webUrl && emailToken) {
        void fetch(`${webUrl}/api/email/submission`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-service-token": emailToken },
          body: JSON.stringify({ applicationId: app.id }),
        }).catch(() => {});
      }
    } else {
      await setStatus(app.id, "failed", { failure_reason: "submission not confirmed" });
    }
  } finally {
    await context.close();
  }
}
