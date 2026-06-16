import { describe, expect, it } from "vitest";
import { validationTargetsFromUnknown } from "./validation.js";

describe("validationTargetsFromUnknown", () => {
  it("accepts either a raw array or a targets wrapper", () => {
    const raw = [
      { label: "Acme", platform: "greenhouse", jobUrl: "https://boards.greenhouse.io/acme/jobs/1" },
      { label: "Missing url" },
    ];

    expect(validationTargetsFromUnknown(raw)).toEqual([
      { label: "Acme", platform: "greenhouse", jobUrl: "https://boards.greenhouse.io/acme/jobs/1" },
    ]);
    expect(validationTargetsFromUnknown({ targets: raw })).toEqual([
      { label: "Acme", platform: "greenhouse", jobUrl: "https://boards.greenhouse.io/acme/jobs/1" },
    ]);
  });
});
