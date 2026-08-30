import WebSocket from 'ws';

export type ReconnectingWebSocketState = 'idle' | 'connecting' | 'open' | 'backoff' | 'stopped';

export interface ReconnectingWebSocketOptions {
  url: string;
  onOpen(socket: WebSocket): void;
  onMessage(message: string): void;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatMs?: number;
  jitter?: (delayMs: number) => number;
}

export class ReconnectingWebSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private alive = false;
  private currentState: ReconnectingWebSocketState = 'idle';

  constructor(private readonly options: ReconnectingWebSocketOptions) {}

  state(): ReconnectingWebSocketState {
    return this.currentState;
  }

  start(): void {
    if (this.currentState !== 'idle') return;
    this.connect();
  }

  stop(): void {
    this.currentState = 'stopped';
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) socket.close();
  }

  private connect(): void {
    if (this.currentState === 'stopped') return;
    this.currentState = 'connecting';
    const socket = new WebSocket(this.options.url);
    this.socket = socket;

    socket.on('open', () => {
      if (this.currentState === 'stopped') {
        socket.close();
        return;
      }
      this.currentState = 'open';
      this.reconnectAttempt = 0;
      this.alive = true;
      this.startHeartbeat(socket);
      this.options.onOpen(socket);
    });
    socket.on('message', (message) => {
      this.options.onMessage(message.toString());
    });
    socket.on('pong', () => {
      this.alive = true;
    });
    socket.on('error', () => {
      socket.terminate();
    });
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (this.currentState !== 'stopped') this.scheduleReconnect();
    });
  }

  private startHeartbeat(socket: WebSocket): void {
    const heartbeatMs = this.options.heartbeatMs ?? 15_000;
    this.heartbeatTimer = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (!this.alive) {
        socket.terminate();
        return;
      }
      this.alive = false;
      socket.ping();
    }, heartbeatMs);
  }

  private scheduleReconnect(): void {
    this.currentState = 'backoff';
    const base = this.options.reconnectBaseDelayMs ?? 500;
    const maximum = this.options.reconnectMaxDelayMs ?? 30_000;
    const rawDelay = Math.min(base * 2 ** this.reconnectAttempt, maximum);
    this.reconnectAttempt += 1;
    const jitter =
      this.options.jitter ?? ((delayMs: number) => delayMs * (0.8 + Math.random() * 0.4));
    const delay = Math.max(0, Math.round(jitter(rawDelay)));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
