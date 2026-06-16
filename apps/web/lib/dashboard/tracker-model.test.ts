import { describe, expect, it } from "vitest";
import {
  customStageIdFromLabel,
  labelForTrackerStage,
  statusForTrackerStage,
  trackerSourceForApplyPath,
  trackerStageForStatus,
} from "./tracker-model";

describe("tracker model mapping", () => {
  it("maps application statuses into tracker columns", () => {
    expect(trackerStageForStatus("submitted")).toBe("applied");
    expect(trackerStageForStatus("interview")).toBe("interview");
    expect(trackerStageForStatus("failed")).toBe("closed");
    expect(statusForTrackerStage("offer")).toBe("offer");
  });

  it("normalizes custom tracker columns", () => {
    expect(customStageIdFromLabel("Reviewed")).toBe("custom:reviewed");
    expect(customStageIdFromLabel("Followed up")).toBe("custom:followed-up");
    expect(trackerStageForStatus("custom:contacted")).toBe("custom:contacted");
    expect(statusForTrackerStage("custom:contacted")).toBe("custom:contacted");
    expect(labelForTrackerStage("custom:followed-up")).toBe("Followed Up");
  });

  it("maps apply paths into tracker sources", () => {
    expect(trackerSourceForApplyPath("extension")).toBe("extension");
    expect(trackerSourceForApplyPath("server")).toBe("server");
    expect(trackerSourceForApplyPath("manual")).toBe("manual");
    expect(trackerSourceForApplyPath("job_board")).toBe("job_board");
  });
});
