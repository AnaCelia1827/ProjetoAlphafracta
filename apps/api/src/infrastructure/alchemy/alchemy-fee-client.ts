import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import type { FeeEvidence } from '../../domain/fees/models.js';
import type { EthereumFeeSource } from '../../domain/fees/ports.js';
import type { Clock } from '../../domain/shared/clock.js';
import { AlchemyProviderUnavailableError } from './alchemy-errors.js';

/**
 * Camada: infraestrutura Alchemy.
 *
 * Adapta a chamada HTTP de fee history para a porta EthereumFeeSource. Falhas,
 * respostas incompletas e detalhes da biblioteca viram um único erro tipado.
 */
/** Configuração de transporte e tempo injetável do cliente de evidência de taxa. */
export interface AlchemyFeeClientOptions {
  httpUrl: string;
  clock: Clock;
  timeoutMs: number;
}

/** Cliente HTTP que normaliza fee history em valores bigint do domínio. */
export class AlchemyFeeClient implements EthereumFeeSource {
  private readonly client;

  /** Cria transporte com rede e timeout fixados pelo runtime. */
  constructor(private readonly options: AlchemyFeeClientOptions) {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(options.httpUrl, { timeout: options.timeoutMs }),
    });
  }

  /**
   * Busca base fee atual/projetada e recompensas P60, registrando o horário de
   * observação local. Não deixa payload ou erro do provedor escapar à aplicação.
   */
  async getFeeEvidence(): Promise<FeeEvidence> {
    try {
      const history = await this.client.getFeeHistory({
        blockCount: 10,
        blockTag: 'latest',
        rewardPercentiles: [60],
      });
      const latestBaseFeeWei = history.baseFeePerGas.at(-2);
      const projectedNextBaseFeeWei = history.baseFeePerGas.at(-1);
      if (latestBaseFeeWei === undefined || projectedNextBaseFeeWei === undefined) {
        throw new AlchemyProviderUnavailableError();
      }

      return {
        latestBaseFeeWei,
        projectedNextBaseFeeWei,
        historicalRewardP60Wei: (history.reward ?? [])
          .map((reward) => reward[0])
          .filter((reward): reward is bigint => reward !== undefined),
        ethereumUpdatedAt: this.options.clock.now(),
      };
    } catch (error) {
      if (error instanceof AlchemyProviderUnavailableError) throw error;
      throw new AlchemyProviderUnavailableError();
    }
  }
}
