import { describe, expect, it } from "vitest";
import { toBlockViewModel, toFeeViewModel } from "@/lib/api/view-models";
import { blockFixture, feeSnapshotFixture } from "./fixtures";

describe("API view models", () => {
  it("derives transfer cost and confidence from the shared fee DTO", () => {
    const view = toFeeViewModel(feeSnapshotFixture);

    expect(view.maxCostUsd).toBe(2.31);
    expect(view.confidence).toEqual({
      level: "high",
      reasons: ["fresh-data"],
    });
  });

  it("preserves decimal block identity and canonical actions", () => {
    const view = toBlockViewModel(blockFixture);

    expect(view.number).toBe("23548192");
    expect(view.priorityFeeGwei).toBe(1.8);
    expect(view.etherscanUrl).toBe("https://etherscan.io/block/23548192");
  });
});
