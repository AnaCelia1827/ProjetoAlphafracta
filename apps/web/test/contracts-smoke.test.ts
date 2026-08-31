import { FeeSnapshotSchema } from "@alphractal/contracts";
import { describe, expect, it } from "vitest";

describe("frontend contract dependency", () => {
  it("loads the shared fee schema", () => {
    expect(FeeSnapshotSchema).toBeDefined();
  });
});
