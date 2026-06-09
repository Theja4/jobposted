import { matchFields } from "@jobposted/field-match";
import { newContext } from "./browser";
import { pickHandler } from "./handlers";
import { extractFields } from "./extract";
import { fillForm } from "./fill";
import { detectChallenge } from "./captcha";
import { getBaseResume, uploadScreenshot } from "./storage";
import { supabaseCache } from "./cache";
import { loadProfile } from "./profile";
import { setStatus, type ClaimedApplication, type JobRow } from "./queue";
import { log } from "./logger";

/**
 * Fill an open-ATS form and PARK at ready_for_review (design doc §11.1). Never submits.
 * Optionally returns a screenshot buffer for offline inspection.
 */
export async function runApply(app: ClaimedApplication, job: JobRow): Promise<void> {
  if (!job.apply_url) {
    await setStatus(app.id, "failed", { failure_reason: "no apply_url" });
    return;
  }
  const profile = await loadProfile(app.user_id);
  if (!profile) {
    await setStatus(app.id, "failed", { failure_reason: "no profile" });
    return;
  }
  const resume = await getBaseResume(app.user_id);

  const context = await newContext();
  const page = await context.newPage();
  try {
    const handler = pickHandler(job.apply_url);
    await handler.gotoForm(page, job.apply_url);

    const challenge = await detectChallenge(page);
    if (challenge) {
      // Do not attempt to solve — route to the extension/manual path (design doc §11.4).
      await setStatus(app.id, "failed", {
        failure_reason: `challenge:${challenge}`,
        apply_path: "extension",
      });
      log.warn("challenge hit; routed to extension/manual", { id: app.id, challenge });
      return;
    }

    const fields = await extractFields(page, handler.formSelector);
    if (fields.length === 0) {
      await setStatus(app.id, "failed", { failure_reason: "no form fields found" });
      return;
    }

    const before = await page.screenshot({ fullPage: true });
    const fieldMap = await matchFields(
      {
        atsType: handler.atsType,
        company: job.company ?? "",
        fields,
        profile,
        jobContext: {
          title: job.title ?? undefined,
          company: job.company ?? undefined,
          descriptionMd: job.description_md,
        },
        screenshotBase64: before.toString("base64"),
      },
      { cache: supabaseCache },
    );

    const { filled, failed } = await fillForm(page, fieldMap, fields, resume);
    const shot = await page.screenshot({ fullPage: true });
    const screenshotPath = await uploadScreenshot(app.user_id, app.id, shot);

    await setStatus(app.id, "ready_for_review", {
      field_map: fieldMap,
      screenshot_path: screenshotPath,
      failure_reason: null,
      attempts: (app.attempts ?? 0) + 1,
    });
    log.info("parked ready_for_review", { id: app.id, filled, failed, fields: fields.length });
  } finally {
    await context.close();
  }
}
