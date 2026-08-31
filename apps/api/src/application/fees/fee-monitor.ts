/**
 * Camada: aplicação de taxas.
 *
 * Coalesce disparos concorrentes de WebSocket, bootstrap e timer em no máximo
 * uma execução ativa seguida de uma repetição, evitando tempestade de RPC.
 */
/** Capacidade mínima de cálculo usada pelo coordenador de disparos. */
export interface FeeCalculation {
  /** Executa um cálculo completo de snapshot. */
  execute(): Promise<unknown>;
}

/** Coordenador serial que preserva um único novo disparo recebido durante cálculo. */
export class FeeMonitor {
  private running = false;
  private pending = false;

  /** Recebe o cálculo real sem depender de sua implementação concreta. */
  constructor(private readonly calculate: FeeCalculation) {}

  /**
   * Solicita atualização. Disparos durante uma execução viram um único ciclo
   * pendente, garantindo que eventos novos não sejam perdidos nem multipliquem I/O.
   */
  async trigger(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }

    this.running = true;
    try {
      do {
        this.pending = false;
        await this.calculate.execute();
      } while (this.pending);
    } finally {
      this.running = false;
    }
  }
}
