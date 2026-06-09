/**
 * Offline verification (design doc §16): load saved Greenhouse + Lever apply-form HTML, run the
 * real extract → match → fill pipeline (mocked LLM, no network/DB), and assert the form filled.
 *   pnpm --filter @jobposted/worker fixtures
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Profile } from "@jobposted/shared";
import type { CustomResolver } from "@jobposted/field-match";
import { matchFields } from "@jobposted/field-match";
import { newContext, closeBrowser } from "./browser";
import { extractFields } from "./extract";
import { fillForm } from "./fill";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "fixtures");

const profile: Profile = {
  id: "test", fullName: "Jane Doe", email: "jane@example.com", phone: "+1 555 111 2222",
  location: "Remote (US)", linkedinUrl: "https://linkedin.com/in/jane",
  portfolioUrl: "https://github.com/jane", workAuthorization: "citizen", needsSponsorship: false,
  relocationOk: true, relocationNotes: null, salaryExpectationMin: 150000,
  salaryExpectationMax: 190000, salaryCurrency: "USD", noticePeriodDays: 30,
  preferences: null, onboardedAt: null,
};

// Mocked LLM: answers selects + open-ended without any API call.
const mockResolver: CustomResolver = async (unresolved) => ({
  fields: unresolved.map((f) => ({
    selector: f.selector,
    value: f.options?.find((o) => /yes|5\+|3-5/i.test(o)) ?? f.options?.[1] ?? "I'm genuinely excited about this role; my background is a strong fit.",
    type: f.type,
    confidence: 0.9,
  })),
  openEnded: unresolved.filter((f) => f.type === "textarea").map((f) => ({ questionId: f.label, text: "Strong fit." })),
});

let failures = 0;
const assert = (name: string, cond: boolean) => {
  console.info(`${cond ? "✓" : "✗ FAIL"}  ${name}`);
  if (!cond) failures++;
};

async function runOne(name: string, expect: (v: Record<string, string>) => void) {
  const html = readFileSync(join(fixtureDir, `${name}.html`), "utf8");
  const ctx = await newContext();
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });

  const fields = await extractFields(page);
  console.info(`\n[${name}] extracted ${fields.length} fields`);
  const fieldMap = await matchFields(
    { atsType: name === "greenhouse" ? "greenhouse" : "lever", company: "Acme", fields, profile },
    { resolveCustom: mockResolver },
  );
  const res = await fillForm(page, fieldMap, fields, null);
  console.info(`[${name}] filled ${res.filled}, failed ${res.failed}`);

  const values = await page.evaluate(() => {
    const v: Record<string, string> = {};
    document.querySelectorAll("input, select, textarea").forEach((el) => {
      const e = el as HTMLInputElement;
      if (e.type === "file") return;
      v[e.name || e.id] = e.value;
    });
    return v;
  });
  expect(values);
  await ctx.close();
}

async function main() {
  await runOne("greenhouse", (v) => {
    assert("gh first name", v["job_application[first_name]"] === "Jane");
    assert("gh last name", v["job_application[last_name]"] === "Doe");
    assert("gh email", v["job_application[email]"] === "jane@example.com");
    assert("gh phone filled", v["job_application[phone]"] === "+1 555 111 2222");
    assert("gh work-auth select answered", v["question_auth"] === "Yes");
    assert("gh open-ended answered", (v["question_why"] ?? "").length > 0);
  });
  await runOne("lever", (v) => {
    assert("lever full name", v["name"] === "Jane Doe");
    assert("lever email", v["email"] === "jane@example.com");
    assert("lever linkedin", v["urls[LinkedIn]"] === "https://linkedin.com/in/jane");
    assert("lever exp select answered", /years/.test(v["exp"] ?? ""));
    assert("lever open-ended answered", (v["why"] ?? "").length > 0);
  });

  await closeBrowser();
  console.info(`\n${failures === 0 ? "ALL FIXTURES PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
