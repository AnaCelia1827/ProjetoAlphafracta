import type { Request, Response } from 'express';

import type {
  LiveEvent,
  LiveEventPublisher,
} from '../../application/common/live-event-publisher.js';
import type { BlockSummary } from '../../domain/blocks/models.js';
import type { FeeSnapshot } from '../../domain/fees/models.js';
import { serializeLiveEvent } from '../http/live-serializers.js';

const MAX_QUEUED_EVENTS = 100;
const MAX_QUEUED_BYTES = 256 * 1024;
const HEARTBEAT_MS = 15_000;
const RETRY_MS = 3_000;

interface SseClient {
  request: Request;
  response: Response;
  queue: string[];
  queuedBytes: number;
  blocked: boolean;
  onDrain: () => void;
  onClose: () => void;
}

function eventFrame(event: LiveEvent): string {
  const serialized = serializeLiveEvent(event);
  return `id: ${serialized.id}\nevent: ${serialized.event}\ndata: ${JSON.stringify(serialized.data)}\n\n`;
}

export class LiveSseHub implements LiveEventPublisher {
  private readonly clients = new Set<SseClient>();
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private latestFeeSnapshot: FeeSnapshot | null = null;
  private latestBlock: BlockSummary | null = null;

  constructor() {
    this.heartbeat = setInterval(() => {
      this.broadcast(': heartbeat\n\n');
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  handle(request: Request, response: Response): void {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const client: SseClient = {
      request,
      response,
      queue: [],
      queuedBytes: 0,
      blocked: false,
      onDrain: () => this.drain(client),
      onClose: () => this.disconnect(client, false),
    };
    this.clients.add(client);
    response.on('drain', client.onDrain);
    response.on('close', client.onClose);
    request.on('close', client.onClose);

    this.write(client, `retry: ${RETRY_MS}\n\n`);
    if (this.latestFeeSnapshot !== null) {
      this.write(client, eventFrame({ type: 'fee-snapshot', snapshot: this.latestFeeSnapshot }));
    }
    if (this.latestBlock !== null) {
      this.write(client, eventFrame({ type: 'block-added', block: this.latestBlock }));
    }
  }

  publish(event: LiveEvent): void {
    if (event.type === 'fee-snapshot') this.latestFeeSnapshot = event.snapshot;
    if (event.type === 'block-added') this.latestBlock = event.block;
    if (
      event.type === 'block-status-changed' &&
      this.latestBlock?.number === event.change.number &&
      this.latestBlock.hash.toLowerCase() === event.change.hash.toLowerCase()
    ) {
      this.latestBlock = { ...this.latestBlock, finality: event.change.finality };
    }
    this.broadcast(eventFrame(event));
  }

  clientCount(): number {
    return this.clients.size;
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const client of [...this.clients]) this.disconnect(client, true);
    this.latestFeeSnapshot = null;
    this.latestBlock = null;
  }

  private broadcast(frame: string): void {
    for (const client of [...this.clients]) this.write(client, frame);
  }

  private write(client: SseClient, frame: string): void {
    if (!this.clients.has(client)) return;
    if (!client.blocked) {
      client.blocked = !client.response.write(frame);
      return;
    }

    client.queue.push(frame);
    client.queuedBytes += Buffer.byteLength(frame);
    if (client.queue.length > MAX_QUEUED_EVENTS || client.queuedBytes > MAX_QUEUED_BYTES) {
      this.disconnect(client, true);
    }
  }

  private drain(client: SseClient): void {
    if (!this.clients.has(client)) return;
    client.blocked = false;
    while (client.queue.length > 0) {
      const frame = client.queue.shift()!;
      client.queuedBytes -= Buffer.byteLength(frame);
      if (!client.response.write(frame)) {
        client.blocked = true;
        return;
      }
    }
  }

  private disconnect(client: SseClient, end: boolean): void {
    if (!this.clients.delete(client)) return;
    client.queue.length = 0;
    client.queuedBytes = 0;
    client.response.off('drain', client.onDrain);
    client.response.off('close', client.onClose);
    client.request.off('close', client.onClose);
    if (end && !client.response.writableEnded) client.response.end();
  }
}
