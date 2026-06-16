import { describe, expect, it } from "vitest";
import { detectPageBlocker } from "./blockers.js";

function fakePage(input: { text?: string; selectors?: string[] }) {
  const selectors = new Set(input.selectors ?? []);
  return {
    locator(selector: string) {
      return {
        async count() {
          return selectors.has(selector) ? 1 : 0;
        },
        async innerText() {
          return input.text ?? "";
        },
      };
    },
    async content() {
      return `<body>${input.text ?? ""}</body>`;
    },
  };
}

describe("detectPageBlocker", () => {
  it("detects captcha widgets", async () => {
    await expect(
      detectPageBlocker(fakePage({ selectors: ["iframe[src*='recaptcha']"] }) as never),
    ).resolves.toMatchObject({ blocker: "captcha_required", reason: "captcha_required" });
  });

  it("detects login walls from page copy", async () => {
    await expect(
      detectPageBlocker(fakePage({ text: "Please sign in to continue with this application." }) as never),
    ).resolves.toMatchObject({ blocker: "login_required", reason: "login_required" });
  });

  it("detects closed jobs", async () => {
    await expect(
      detectPageBlocker(fakePage({ text: "This posting is no longer accepting applications." }) as never),
    ).resolves.toMatchObject({ blocker: "closed_job", reason: "closed_job" });
  });

  it("returns no blocker for normal pages", async () => {
    await expect(detectPageBlocker(fakePage({ text: "Apply for this role" }) as never)).resolves.toEqual({
      blocker: null,
      reason: null,
    });
  });
});
