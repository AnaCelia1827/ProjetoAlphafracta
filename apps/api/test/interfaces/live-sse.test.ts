import { EventEmitter } from 'node:events';

import { LiveEventSchema } from '@alphractal/contracts';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LiveSseHub } from '../../src/interfaces/sse/live-sse-hub.js';
import { blockSummary, feeSnapshot, FIXED_NOW } from '../helpers/fixtures.js';

class ControlledRequest extends EventEmitter {
  constructor(readonly lastEventId?: string) {
    super();
  }

  header(name: string): string | undefined {
    return name.toLowerCase() === 'last-event-id' ? this.lastEventId : undefined;
  }
}

class ControlledResponse extends EventEmitter {
  readonly headers = new Map<string, string>();
  readonly frames: string[] = [];
  ended = false;
  blockWrites = false;

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  flushHeaders(): void {}

  write(frame: string): boolean {
    this.frames.push(frame);
    return !this.blockWrites;
  }

  end(): this {
    if (this.ended) return this;
    this.ended = true;
    this.emit('close');
    return this;
  }
}

function connect(hub: LiveSseHub, lastEventId?: string) {
  const request = new ControlledRequest(lastEventId);
  const response = new ControlledResponse();
  hub.handle(request as unknown as Request, response as unknown as Response);
  return { request, response };
}

function eventFromFrame(frame: string) {
  const id = /^id: (.+)$/m.exec(frame)?.[1];
  const event = /^event: (.+)$/m.exec(frame)?.[1];
  const data = /^data: (.+)$/m.exec(frame)?.[1];
  if (id === undefined || event === undefined || data === undefined) return null;
  return LiveEventSchema.parse({ id, event, data: JSON.parse(data) });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LiveSseHub', () => {
  it('sets stream headers, retry and sends the latest fee and block state', () => {
    const hub = new LiveSseHub();
    const snapshot = feeSnapshot();
    const block = blockSummary(20_000_000n);
    hub.publish({ type: 'fee-snapshot', snapshot });
    hub.publish({ type: 'block-added', block });

    const { response } = connect(hub, 'fee:old-event-that-is-not-replayed');

    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    expect(response.frames[0]).toBe('retry: 3000\n\n');
    expect(eventFromFrame(response.frames[1]!)).toMatchObject({
      id: `fee:${FIXED_NOW.toISOString()}`,
      event: 'fee-snapshot',
    });
    expect(eventFromFrame(response.frames[2]!)).toMatchObject({
      id: `block:20000000:${block.hash}`,
      event: 'block-added',
    });
    hub.close();
  });

  it('uses exact event names, ids and the shared complete serializers', () => {
    const hub = new LiveSseHub();
    const { response } = connect(hub);
    const snapshot = feeSnapshot();
    const block = blockSummary(20_000_000n);
    hub.publish({ type: 'fee-snapshot', snapshot });
    hub.publish({ type: 'block-added', block });
    hub.publish({
      type: 'block-status-changed',
      change: { number: block.number, hash: block.hash, finality: 'safe' },
    });

    const events = response.frames.slice(1).map(eventFromFrame);
    expect(events).toEqual([
      expect.objectContaining({
        id: `fee:${FIXED_NOW.toISOString()}`,
        event: 'fee-snapshot',
        data: { data: expect.objectContaining({ recommendedMaxFeeGwei: 35.75 }) },
      }),
      expect.objectContaining({
        id: `block:20000000:${block.hash}`,
        event: 'block-added',
        data: {
          data: expect.objectContaining({ etherscanUrl: 'https://etherscan.io/block/20000000' }),
        },
      }),
      expect.objectContaining({
        id: 'block-status:20000000:safe',
        event: 'block-status-changed',
        data: { data: { number: '20000000', hash: block.hash, finality: 'safe' } },
      }),
    ]);
    hub.close();
  });

  it('uses one 15-second heartbeat timer and removes closed clients', async () => {
    vi.useFakeTimers();
    const hub = new LiveSseHub();
    const first = connect(hub);
    const second = connect(hub);
    expect(hub.clientCount()).toBe(2);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(first.response.frames.at(-1)).toBe(': heartbeat\n\n');
    expect(second.response.frames.at(-1)).toBe(': heartbeat\n\n');

    first.request.emit('close');
    expect(hub.clientCount()).toBe(1);
    hub.close();
    expect(second.response.ended).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('queues blocked writes in order and drains without blocking a fast client', () => {
    const hub = new LiveSseHub();
    const slow = connect(hub).response;
    const fast = connect(hub).response;
    slow.blockWrites = true;
    const first = feeSnapshot();
    const second = feeSnapshot({ timestamp: new Date(FIXED_NOW.getTime() + 1_000) });

    hub.publish({ type: 'fee-snapshot', snapshot: first });
    hub.publish({ type: 'fee-snapshot', snapshot: second });

    expect(fast.frames).toHaveLength(3);
    expect(slow.frames).toHaveLength(2);
    slow.blockWrites = false;
    slow.emit('drain');
    expect(slow.frames).toHaveLength(3);
    expect(eventFromFrame(slow.frames[2]!)!.id).toBe(`fee:${second.timestamp.toISOString()}`);
    hub.close();
  });

  it('disconnects only a slow client after its queue exceeds 100 events', () => {
    const hub = new LiveSseHub();
    const slow = connect(hub).response;
    const fast = connect(hub).response;
    slow.blockWrites = true;

    for (let index = 0; index < 102; index += 1) {
      hub.publish({
        type: 'fee-snapshot',
        snapshot: feeSnapshot({ timestamp: new Date(FIXED_NOW.getTime() + index) }),
      });
    }

    expect(slow.ended).toBe(true);
    expect(fast.ended).toBe(false);
    expect(hub.clientCount()).toBe(1);
    hub.close();
  });

  it('disconnects a client when queued data exceeds 256 KiB', () => {
    const hub = new LiveSseHub();
    const slow = connect(hub).response;
    slow.blockWrites = true;
    const oversized = feeSnapshot({
      confidence: {
        level: 'unavailable',
        reasons: Array.from({ length: 30_000 }, () => 'missing-data' as const),
      },
    });

    hub.publish({ type: 'fee-snapshot', snapshot: oversized });
    hub.publish({
      type: 'fee-snapshot',
      snapshot: feeSnapshot({ ...oversized, timestamp: new Date(FIXED_NOW.getTime() + 1) }),
    });

    expect(slow.ended).toBe(true);
    expect(hub.clientCount()).toBe(0);
    hub.close();
  });
});
