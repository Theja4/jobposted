import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { isGreenhousePage, isLeverPage } from "./open-ats";

function documentFrom(html: string) {
  return parseHTML(html).document;
}

describe("open ATS content helpers", () => {
  it("recognizes hosted and embedded Greenhouse forms", () => {
    expect(isGreenhousePage("https://boards.greenhouse.io/acme/jobs/1", documentFrom("<main />"))).toBe(true);
    expect(isGreenhousePage("https://company.com/careers?gh_jid=123", documentFrom("<main />"))).toBe(true);
    expect(
      isGreenhousePage(
        "https://company.com/jobs/1",
        documentFrom(`<form><input name="job_application[first_name]" /></form>`),
      ),
    ).toBe(true);
  });

  it("recognizes Lever hosted forms without matching unrelated hosts", () => {
    expect(isLeverPage("https://jobs.lever.co/acme/123")).toBe(true);
    expect(isLeverPage("https://careers.example.com/acme/123")).toBe(false);
  });
});
