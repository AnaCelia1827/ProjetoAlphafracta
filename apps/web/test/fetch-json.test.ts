import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { fetchJson } from "@/lib/api/fetch-json";

afterEach(() => vi.unstubAllGlobals());

describe("fetchJson", () => {
  it("preserves the backend error code and request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "BLOCK_NOT_FOUND",
              message: "Block not found",
              requestId: "req-1",
            },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const error = await fetchJson("/api/v1/blocks/1", z.unknown()).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: "BLOCK_NOT_FOUND",
      requestId: "req-1",
    });
  });
});
