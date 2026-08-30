import { EthereumProviderUnavailableError } from '../../application/common/errors.js';

export class AlchemyProviderUnavailableError extends EthereumProviderUnavailableError {
  constructor() {
    super();
    this.name = 'AlchemyProviderUnavailableError';
  }
}
