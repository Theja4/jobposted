import type {
  ExtensionAutofillPlanItem,
  ExtensionFieldFillRecord,
  ExtensionPlatform,
  ExtensionResumeResponse,
  MasterProfile,
} from "@jobposted/shared";
import type { PageField } from "./autofill";
import { createGreenhouseFillStrategy, createLeverFillStrategy } from "./open-ats";
import { createWorkdayFillStrategy } from "./workday";

export interface PlatformFillStrategy {
  id: ExtensionPlatform | "generic";
  preparePage?(args: {
    doc: Document;
    profile: MasterProfile;
    shouldStop?: () => boolean;
  }): Promise<void>;
  fillField?(args: {
    field: PageField;
    item: ExtensionAutofillPlanItem;
    getResume: () => Promise<ExtensionResumeResponse | null>;
    shouldStop?: () => boolean;
  }): Promise<ExtensionFieldFillRecord | null>;
}

export function strategyForPlatform(platform: ExtensionPlatform): PlatformFillStrategy | null {
  if (platform === "workday") return createWorkdayFillStrategy();
  if (platform === "greenhouse") return createGreenhouseFillStrategy();
  if (platform === "lever") return createLeverFillStrategy();
  return null;
}
