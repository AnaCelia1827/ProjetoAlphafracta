export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class SnapshotUnavailableError extends ApplicationError {
  constructor() {
    super('SNAPSHOT_UNAVAILABLE', 503, 'No fee snapshot is available');
  }
}

export class HistoryUnavailableError extends ApplicationError {
  constructor() {
    super('HISTORY_UNAVAILABLE', 503, 'Fee history is unavailable');
  }
}

export class EthereumProviderUnavailableError extends ApplicationError {
  constructor() {
    super('ETHEREUM_PROVIDER_UNAVAILABLE', 503, 'Ethereum provider is unavailable');
  }
}

export class PersistenceUnavailableError extends Error {
  constructor() {
    super('Persistence is unavailable');
    this.name = new.target.name;
  }
}

export class InvalidBlockIdentifierError extends ApplicationError {
  constructor() {
    super('INVALID_BLOCK_IDENTIFIER', 400, 'The block identifier is invalid');
  }
}

export class BlockNotFoundError extends ApplicationError {
  constructor() {
    super('BLOCK_NOT_FOUND', 404, 'The requested block was not found');
  }
}

export class PreEip1559BlockUnsupportedError extends ApplicationError {
  constructor() {
    super(
      'PRE_EIP1559_BLOCK_UNSUPPORTED',
      422,
      'Blocks before EIP-1559 are outside the supported range',
    );
  }
}

export class BlocksUnavailableError extends ApplicationError {
  constructor() {
    super('BLOCKS_UNAVAILABLE', 503, 'Recent blocks are unavailable');
  }
}

export interface ApplicationErrorDetail {
  field: string;
  issue: string;
}

export class InvalidQueryError extends ApplicationError {
  constructor(
    readonly details?: ApplicationErrorDetail[],
    message = 'The request parameters are invalid',
  ) {
    super('INVALID_QUERY', 400, message);
  }
}

export class InvalidTimeRangeError extends ApplicationError {
  constructor() {
    super('INVALID_TIME_RANGE', 400, 'The requested time range is invalid');
  }
}

export class RouteNotFoundError extends ApplicationError {
  constructor() {
    super('ROUTE_NOT_FOUND', 404, 'The requested route was not found');
  }
}
