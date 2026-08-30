export class AlchemyProviderUnavailableError extends Error {
  constructor() {
    super('Ethereum provider is unavailable');
    this.name = 'AlchemyProviderUnavailableError';
  }
}
