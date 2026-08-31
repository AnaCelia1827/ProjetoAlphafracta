import WebSocket from 'ws';

/**
 * Camada: infraestrutura compartilhada.
 *
 * Gerencia ciclo de vida WebSocket com heartbeat, backoff exponencial e jitter.
 * Ele não interpreta protocolo de negócio: clientes fornecem inscrição e parse
 * para que falhas de conexão possam ser recuperadas de modo reutilizável.
 */
/** Estados observáveis do transporte para testes e diagnóstico de ciclo de vida. */
export type ReconnectingWebSocketState = 'idle' | 'connecting' | 'open' | 'backoff' | 'stopped';

/** Callbacks e limites que especializam uma conexão reconectável. */
export interface ReconnectingWebSocketOptions {
  url: string;
  onOpen(socket: WebSocket): void;
  onMessage(message: string): void;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatMs?: number;
  jitter?: (delayMs: number) => number;
}

/** Transporte reconectável que mantém no máximo um socket e um timer de cada tipo. */
export class ReconnectingWebSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private alive = false;
  private currentState: ReconnectingWebSocketState = 'idle';

  /** Recebe protocolo de aplicação e a política configurável de reconexão. */
  constructor(private readonly options: ReconnectingWebSocketOptions) {}

  /** Expõe estado sem permitir que o consumidor altere o ciclo de vida interno. */
  state(): ReconnectingWebSocketState {
    return this.currentState;
  }

  /** Inicia somente a partir de idle, evitando múltiplas conexões por engano. */
  start(): void {
    if (this.currentState !== 'idle') return;
    this.connect();
  }

  /**
   * Cancela timers e fecha o socket de modo idempotente, bloqueando reconexões
   * iniciadas por eventos close posteriores.
   */
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

  /** Abre socket, delega mensagens e agenda recuperação após fechamento inesperado. */
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

  /** Detecta conexão silenciosamente morta com ping/pong antes de reconectar. */
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

  /** Agenda próxima tentativa com backoff limitado e jitter para evitar reconexões em massa. */
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
