import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveMonitor } from "@/hooks/use-live-monitor";
import { fetchCurrentFee } from "@/lib/api/fetch-current-fee";
import { fetchRecentBlocks } from "@/lib/api/fetch-recent-blocks";
import { blockFixture, feeSnapshotFixture } from "./fixtures";

vi.mock("@/lib/api/fetch-current-fee", () => ({
  fetchCurrentFee: vi.fn(),
}));

vi.mock("@/lib/api/fetch-recent-blocks", () => ({
  fetchRecentBlocks: vi.fn(),
}));

type Listener = (event: Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly listeners = new Map<string, Set<Listener>>();
  closed = false;

  constructor(readonly url: string | URL) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback: Listener =
      typeof listener === "function"
        ? listener
        : (event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (typeof listener === "function") {
      this.listeners.get(type)?.delete(listener);
    }
  }

  emit(type: string, event: Event = new Event(type)) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  close() {
    this.closed = true;
  }
}

const fetchCurrentFeeMock = vi.mocked(fetchCurrentFee);
const fetchRecentBlocksMock = vi.mocked(fetchRecentBlocks);

beforeEach(() => {
  FakeEventSource.instances = [];
  fetchCurrentFeeMock.mockResolvedValue(feeSnapshotFixture);
  fetchRecentBlocksMock.mockResolvedValue([blockFixture]);
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useLiveMonitor", () => {
  it("bootstraps REST, handles named fee events, and refetches on reconnect", async () => {
    const { result, unmount } = renderHook(() => useLiveMonitor());

    await waitFor(() => expect(result.current.fee).not.toBeNull());
    expect(result.current.blocks).toHaveLength(1);
    expect(fetchCurrentFeeMock).toHaveBeenCalledTimes(1);
    expect(fetchRecentBlocksMock).toHaveBeenCalledTimes(1);

    const stream = FakeEventSource.instances[0]!;
    expect(stream.url).toBe("/api/v1/live/stream");
    expect([...stream.listeners.keys()]).toEqual(
      expect.arrayContaining([
        "fee-snapshot",
        "block-added",
        "block-status-changed",
      ]),
    );

    const updatedFee = {
      ...feeSnapshotFixture,
      timestamp: "2026-08-31T03:02:00.000Z",
      recommendedMaxFeeGwei: 55,
    };

    act(() => {
      stream.emit(
        "fee-snapshot",
        new MessageEvent("fee-snapshot", {
          data: JSON.stringify({ data: updatedFee }),
          lastEventId: `fee:${updatedFee.timestamp}`,
        }),
      );
    });
    expect(result.current.fee?.recommendedMaxFeeGwei).toBe(55);

    act(() => stream.emit("open"));
    expect(fetchCurrentFeeMock).toHaveBeenCalledTimes(1);

    act(() => stream.emit("open"));
    await waitFor(() => expect(fetchCurrentFeeMock).toHaveBeenCalledTimes(2));
    expect(fetchRecentBlocksMock).toHaveBeenCalledTimes(2);

    unmount();
    expect(stream.closed).toBe(true);
  });
});
