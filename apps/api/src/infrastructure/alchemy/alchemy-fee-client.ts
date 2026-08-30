import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import type { FeeEvidence } from '../../domain/fees/models.js';
import type { EthereumFeeSource } from '../../domain/fees/ports.js';
import type { Clock } from '../../domain/shared/clock.js';
import { AlchemyProviderUnavailableError } from './alchemy-errors.js';

export interface AlchemyFeeClientOptions {
  httpUrl: string;
  clock: Clock;
  timeoutMs: number;
}

export class AlchemyFeeClient implements EthereumFeeSource {
  private readonly client;

  constructor(private readonly options: AlchemyFeeClientOptions) {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(options.httpUrl, { timeout: options.timeoutMs }),
    });
  }

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
