/**
 * Camada: aplicação.
 *
 * Concentra erros semânticos que os casos de uso lançam e a camada HTTP traduz
 * em respostas seguras. Erros de persistência permanecem distintos para que o
 * monitor continue funcionando de forma degradada quando possível.
 */
/** Erro de aplicação com código público e status HTTP já decididos pela regra. */
export class ApplicationError extends Error {
  /** Constrói um erro serializável sem expor detalhes internos de dependências. */
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Indica que ainda não existe snapshot atual nem último valor reaproveitável. */
export class SnapshotUnavailableError extends ApplicationError {
  /** Define a resposta temporária de indisponibilidade do snapshot. */
  constructor() {
    super('SNAPSHOT_UNAVAILABLE', 503, 'No fee snapshot is available');
  }
}

/** Indica que consulta de histórico falhou e não possui fallback em memória. */
export class HistoryUnavailableError extends ApplicationError {
  /** Define a resposta temporária de indisponibilidade do histórico. */
  constructor() {
    super('HISTORY_UNAVAILABLE', 503, 'Fee history is unavailable');
  }
}

/** Indica falha transitória ao buscar a evidência Ethereum de um provedor. */
export class EthereumProviderUnavailableError extends ApplicationError {
  /** Define a resposta temporária sem revelar detalhes do provedor externo. */
  constructor() {
    super('ETHEREUM_PROVIDER_UNAVAILABLE', 503, 'Ethereum provider is unavailable');
  }
}

/** Sinal interno para degradar operações que dependem de MongoDB, sem HTTP direto. */
export class PersistenceUnavailableError extends Error {
  /** Cria o erro interno de persistência que os casos de uso reconhecem. */
  constructor() {
    super('Persistence is unavailable');
    this.name = new.target.name;
  }
}

/** Rejeita busca de bloco que não seja altura decimal canônica nem hash válido. */
export class InvalidBlockIdentifierError extends ApplicationError {
  /** Define a resposta de entrada inválida para identificadores de bloco. */
  constructor() {
    super('INVALID_BLOCK_IDENTIFIER', 400, 'The block identifier is invalid');
  }
}

/** Indica que o provedor respondeu corretamente, mas não encontrou o bloco pedido. */
export class BlockNotFoundError extends ApplicationError {
  /** Define a resposta 404 estável para busca pontual de bloco inexistente. */
  constructor() {
    super('BLOCK_NOT_FOUND', 404, 'The requested block was not found');
  }
}

/** Explica que blocos sem base fee não pertencem ao escopo das métricas atuais. */
export class PreEip1559BlockUnsupportedError extends ApplicationError {
  /** Define a resposta que distingue limitação de produto de bloco não encontrado. */
  constructor() {
    super(
      'PRE_EIP1559_BLOCK_UNSUPPORTED',
      422,
      'Blocks before EIP-1559 are outside the supported range',
    );
  }
}

/** Indica que a janela de blocos ainda não foi preenchida nem recuperada. */
export class BlocksUnavailableError extends ApplicationError {
  /** Define a resposta temporária de indisponibilidade da lista recente. */
  constructor() {
    super('BLOCKS_UNAVAILABLE', 503, 'Recent blocks are unavailable');
  }
}

/** Detalhe de validação seguro para indicar campo e regra sem expor stack trace. */
export interface ApplicationErrorDetail {
  field: string;
  issue: string;
}

/** Representa parâmetros de consulta que não atendem ao contrato de entrada. */
export class InvalidQueryError extends ApplicationError {
  /** Constrói erro de consulta com detalhes opcionais consumíveis pelo cliente. */
  constructor(
    readonly details?: ApplicationErrorDetail[],
    message = 'The request parameters are invalid',
  ) {
    super('INVALID_QUERY', 400, message);
  }
}

/** Rejeita intervalo temporal semanticamente inválido após validar seu formato. */
export class InvalidTimeRangeError extends ApplicationError {
  /** Define a resposta para intervalos cuja ordem ou extensão não é aceita. */
  constructor() {
    super('INVALID_TIME_RANGE', 400, 'The requested time range is invalid');
  }
}

/** Representa caminho HTTP não registrado no contrato da aplicação. */
export class RouteNotFoundError extends ApplicationError {
  /** Define a resposta segura para uma rota inexistente. */
  constructor() {
    super('ROUTE_NOT_FOUND', 404, 'The requested route was not found');
  }
}
