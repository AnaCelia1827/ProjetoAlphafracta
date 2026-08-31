import { EthereumProviderUnavailableError } from '../../application/common/errors.js';

/**
 * Camada: infraestrutura Alchemy.
 *
 * Especializa indisponibilidade de Ethereum para que adaptadores possam
 * normalizar qualquer falha de transporte sem expor mensagens do provedor.
 */
/** Erro específico de Alchemy, compatível com o fallback genérico da aplicação. */
export class AlchemyProviderUnavailableError extends EthereumProviderUnavailableError {
  /** Mantém nome observável para logs internos sem alterar o código público. */
  constructor() {
    super();
    this.name = 'AlchemyProviderUnavailableError';
  }
}
