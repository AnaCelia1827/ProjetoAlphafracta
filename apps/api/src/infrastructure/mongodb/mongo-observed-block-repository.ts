import { Long, type Collection } from 'mongodb';

import type { BlockSummary, FinalityChange } from '../../domain/blocks/models.js';
import type { ObservedBlockRepository } from '../../domain/blocks/ports.js';
import { rational, type Rational } from '../../domain/shared/units.js';
import { MongoPersistenceUnavailableError, type MongoDatabaseProvider } from './mongo-client.js';

const COLLECTION_NAME = 'observed_blocks';
const RETENTION_SECONDS = 2_592_000;

interface RationalDocument {
  numerator: string;
  denominator: string;
}

interface ObservedBlockDocument {
  network: 'ethereum-mainnet';
  number: Long;
  hash: string;
  timestamp: Date;
  finality: BlockSummary['finality'];
  feeLevel: BlockSummary['feeLevel'];
  baseFeeWei: string;
  medianPriorityFeeWei: RationalDocument;
  effectiveGasPriceWei: RationalDocument;
  gasUsed: string;
  gasLimit: string;
  utilization: RationalDocument;
  transactionCount: number;
  provider: 'alchemy';
  canonical: boolean;
}

function serializeRational(value: Rational): RationalDocument {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
  };
}

function deserializeRational(value: RationalDocument): Rational {
  return rational(BigInt(value.numerator), BigInt(value.denominator));
}

function serializeBlock(block: BlockSummary): ObservedBlockDocument {
  return {
    network: block.network,
    number: Long.fromBigInt(block.number),
    hash: block.hash,
    timestamp: block.timestamp,
    finality: block.finality,
    feeLevel: block.feeLevel,
    baseFeeWei: block.baseFeeWei.toString(),
    medianPriorityFeeWei: serializeRational(block.medianPriorityFeeWei),
    effectiveGasPriceWei: serializeRational(block.effectiveGasPriceWei),
    gasUsed: block.gasUsed.toString(),
    gasLimit: block.gasLimit.toString(),
    utilization: serializeRational(block.utilization),
    transactionCount: block.transactionCount,
    provider: block.provider,
    canonical: true,
  };
}

function deserializeBlock(document: ObservedBlockDocument): BlockSummary {
  return {
    network: document.network,
    number: document.number.toBigInt(),
    hash: document.hash as BlockSummary['hash'],
    timestamp: document.timestamp,
    finality: document.finality,
    feeLevel: document.feeLevel,
    baseFeeWei: BigInt(document.baseFeeWei),
    medianPriorityFeeWei: deserializeRational(document.medianPriorityFeeWei),
    effectiveGasPriceWei: deserializeRational(document.effectiveGasPriceWei),
    gasUsed: BigInt(document.gasUsed),
    gasLimit: BigInt(document.gasLimit),
    utilization: deserializeRational(document.utilization),
    transactionCount: document.transactionCount,
    provider: document.provider,
  };
}

export class MongoObservedBlockRepository implements ObservedBlockRepository {
  constructor(private readonly manager: MongoDatabaseProvider) {}

  private collection(): Collection<ObservedBlockDocument> {
    return this.manager.database().collection<ObservedBlockDocument>(COLLECTION_NAME);
  }

  async initialize(): Promise<void> {
    try {
      const database = this.manager.database();
      const existing = await database
        .listCollections({ name: COLLECTION_NAME }, { nameOnly: true })
        .hasNext();
      if (!existing) await database.createCollection(COLLECTION_NAME);

      await this.collection().createIndexes([
        {
          key: { network: 1, hash: 1 },
          unique: true,
          name: 'network_hash_unique',
        },
        {
          key: { network: 1, number: -1 },
          unique: true,
          partialFilterExpression: { canonical: true },
          name: 'canonical_network_number_unique',
        },
        {
          key: { network: 1, timestamp: -1 },
          name: 'canonical_window',
        },
        {
          key: { timestamp: 1 },
          expireAfterSeconds: RETENTION_SECONDS,
          name: 'ttl_30_days',
        },
      ]);
    } catch (error) {
      this.fail(error);
    }
  }

  async saveCanonical(block: BlockSummary): Promise<void> {
    try {
      const document = serializeBlock(block);
      await this.collection().updateOne(
        { network: block.network, hash: block.hash },
        { $set: document },
        { upsert: true },
      );
    } catch (error) {
      this.fail(error);
    }
  }

  async markNoncanonical(
    network: 'ethereum-mainnet',
    number: bigint,
    exceptHash: BlockSummary['hash'],
  ): Promise<void> {
    try {
      await this.collection().updateMany(
        {
          network,
          number: Long.fromBigInt(number),
          hash: { $ne: exceptHash },
          canonical: true,
        },
        { $set: { canonical: false } },
      );
    } catch (error) {
      this.fail(error);
    }
  }

  async findRecent(limit: number): Promise<BlockSummary[]> {
    try {
      const documents = await this.collection()
        .find({ network: 'ethereum-mainnet', canonical: true })
        .sort({ number: -1 })
        .limit(limit)
        .toArray();
      return documents.map(deserializeBlock);
    } catch (error) {
      this.fail(error);
    }
  }

  async findCanonicalBefore(timestamp: Date, from: Date): Promise<BlockSummary[]> {
    try {
      const documents = await this.collection()
        .find({
          network: 'ethereum-mainnet',
          canonical: true,
          timestamp: { $gte: from, $lt: timestamp },
        })
        .sort({ timestamp: 1 })
        .toArray();
      return documents.map(deserializeBlock);
    } catch (error) {
      this.fail(error);
    }
  }

  async updateFinality(changes: FinalityChange[]): Promise<void> {
    if (changes.length === 0) return;
    try {
      await this.collection().bulkWrite(
        changes.map((change) => ({
          updateOne: {
            filter: {
              network: 'ethereum-mainnet',
              number: Long.fromBigInt(change.number),
              hash: change.hash,
              canonical: true,
            },
            update: { $set: { finality: change.finality } },
          },
        })),
      );
    } catch (error) {
      this.fail(error);
    }
  }

  isAvailable(): boolean {
    return this.manager.isAvailable();
  }

  private fail(error: unknown): never {
    this.manager.markUnavailable();
    if (error instanceof MongoPersistenceUnavailableError) throw error;
    throw new MongoPersistenceUnavailableError();
  }
}
