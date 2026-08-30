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
