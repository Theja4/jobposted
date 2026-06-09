import type { Page } from "playwright";
import type { FieldMap } from "@jobposted/shared";
import type { PageField } from "@jobposted/field-match";
import { humanType, thinkTime } from "./browser";
import type { ResumeFile } from "./storage";
import { log } from "./logger";

const truthy = (v: string) => /^(yes|true|1|y)$/i.test(v.trim());

/** Fill the form from a field map + upload the resume. Returns how many fields were filled. */
export async function fillForm(
  page: Page,
  fieldMap: FieldMap,
  pageFields: PageField[],
  resume: ResumeFile | null,
): Promise<{ filled: number; failed: number }> {
  let filled = 0;
  let failed = 0;
  const bySelector = new Map(pageFields.map((f) => [f.selector, f]));

  for (const entry of fieldMap.fields) {
    const field = bySelector.get(entry.selector);
    const type = field?.type ?? entry.type;
    try {
      await thinkTime();
      if (type === "select") {
        await page
          .locator(entry.selector)
          .selectOption({ label: entry.value })
          .catch(async () => {
            await page.locator(entry.selector).selectOption(entry.value);
          });
      } else if (type === "radio") {
        // Click the radio in the group whose adjacent label matches the value.
        const group = page.locator(entry.selector);
        const count = await group.count();
        let clicked = false;
        for (let i = 0; i < count; i++) {
          const radio = group.nth(i);
          const val = (await radio.getAttribute("value")) ?? "";
          if (val.toLowerCase() === entry.value.toLowerCase()) {
            await radio.check();
            clicked = true;
            break;
          }
        }
        if (!clicked) await group.first().check();
      } else if (type === "checkbox") {
        const box = page.locator(entry.selector);
        if (truthy(entry.value)) await box.check();
      } else {
        await humanType(page.locator(entry.selector), entry.value);
      }
      filled++;
    } catch (err) {
      failed++;
      log.warn("field fill failed", { selector: entry.selector, error: (err as Error).message });
    }
  }

  // Resume upload — first file input that looks like a resume/CV slot.
  if (resume) {
    const fileField = pageFields.find(
      (f) => f.type === "file" && /resume|cv|curriculum/i.test(`${f.label} ${f.name ?? ""}`),
    );
    const target = fileField ?? pageFields.find((f) => f.type === "file");
    if (target) {
      try {
        await page.locator(target.selector).setInputFiles({
          name: resume.fileName,
          mimeType: resume.contentType,
          buffer: resume.buffer,
        });
        filled++;
      } catch (err) {
        failed++;
        log.warn("resume upload failed", { error: (err as Error).message });
      }
    }
  }

  return { filled, failed };
}
