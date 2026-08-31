/**
 * Camada: domínio compartilhado.
 *
 * Abstrai a leitura de tempo para que regras temporais possam ser deterministas
 * nos testes sem acoplar a máquina do processo à regra de negócio.
 */
/** Fornece o instante atual usado por políticas de idade e atualização. */
export interface Clock {
  /** Retorna uma nova representação do instante corrente. */
  now(): Date;
}

/** Implementação de produção que delega a leitura de tempo ao ambiente Node. */
export class SystemClock implements Clock {
  /** Produz o instante atual quando não há relógio controlado pelo teste. */
  now(): Date {
    return new Date();
  }
}
