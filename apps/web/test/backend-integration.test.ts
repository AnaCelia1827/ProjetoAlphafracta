// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../api/src/app.js";
import { blockSummary, feeSnapshot } from "../../api/test/helpers/fixtures.js";
import { fetchCurrentFee } from "@/lib/api/fetch-current-fee";
import { fetchRecentBlocks } from "@/lib/api/fetch-recent-blocks";

describe("web client against Express", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("consumes the current fee and recent-block envelopes emitted by createApp", async () => {
    const fee = feeSnapshot();
    const block = blockSummary(23548192n);
    const dependencies: NonNullable<Parameters<typeof createApp>[0]> = {
      corsOrigins: new Set(),
      getCurrentFeeSnapshot: { execute: async () => fee },
      getFeeHistory: {
        execute: async () => ({ data: [fee], nextCursor: null }),
      },
      getRecentBlocks: { execute: async () => [block] },
      getBlockByIdentifier: { execute: async () => block },
      liveSseHub: { handle: (_request, response) => response.end() },
    };
    const app = createApp(dependencies);
    const server = app.listen(0);
    close = () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected TCP server");
    }
    const origin = `http://127.0.0.1:${address.port}`;

    await expect(
      fetchCurrentFee(undefined, `${origin}/api/v1/fees/current`),
    ).resolves.toMatchObject({
      recommendedMaxFeeGwei: expect.any(Number),
    });
    await expect(
      fetchRecentBlocks(undefined, `${origin}/api/v1/blocks/recent`),
    ).resolves.toHaveLength(1);
  });
});
