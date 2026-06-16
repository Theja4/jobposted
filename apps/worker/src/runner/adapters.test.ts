import { describe, expect, it } from "vitest";
import { pickAdapter } from "./adapters.js";

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
});
