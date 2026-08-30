import { ObjectId, type Collection, type Filter } from 'mongodb';
import { z } from 'zod';

import { FeeHistoryUnavailableError } from '../../domain/fees/fee-trend.js';
import type {
  EstimatedTransferCost,
  FeeHistoryPage,
  FeeHistoryQuery,
  FeeSnapshot,
  FeeTrend,
} from '../../domain/fees/models.js';
import type { FeeSnapshotRepository } from '../../domain/fees/ports.js';
import { rational, type Rational } from '../../domain/shared/units.js';
import { MongoPersistenceUnavailableError, type MongoDatabaseProvider } from './mongo-client.js';

const COLLECTION_NAME = 'fee_snapshots';
const RETENTION_SECONDS = 2_592_000;

interface RationalDocument {
  numerator: string;
  denominator: string;
}

interface FeeSnapshotDocument {
  _id?: ObjectId;
  timestamp: Date;
  metadata: { network: 'ethereum-mainnet' };
  recommendationState: 'current';
  recommendedMaxFeeWei: string;
  recommendedPriorityFeeWei: string;
  baseFeeWei: string;
  effectiveGasPriceWei: string;
  estimatedTransferCost: Record<string, unknown>;
  trend24h: Record<string, unknown>;
  confidence: FeeSnapshot['confidence'];
  sampleSize: number;
  dataAgeMs: number;
  sourceUpdatedAt: FeeSnapshot['sourceUpdatedAt'];
  status: FeeSnapshot['status'];
}

const CursorSchema = z.object({
  v: z.literal(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  limit: z.number().int().min(1).max(5000),
  afterTimestamp: z.string().datetime(),
  afterId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});

type Cursor = z.infer<typeof CursorSchema>;

export class InvalidHistoryCursorError extends Error {
  constructor() {
    super('The fee history cursor is invalid or does not match the query');
    this.name = 'InvalidHistoryCursorError';
  }
}

function serializeRational(value: Rational): RationalDocument {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
  };
}

function deserializeRational(value: unknown): Rational {
  const document = value as RationalDocument;
  return rational(BigInt(document.numerator), BigInt(document.denominator));
}

function serializeTransferCost(value: EstimatedTransferCost): Record<string, unknown> {
  const base = {
    status: value.status,
    transactionType: value.transactionType,
    gasUnits: value.gasUnits.toString(),
    maxCostEth: serializeRational(value.maxCostEth),
  };
  if (value.status === 'unavailable') return base;

  return {
    ...base,
    ethUsd: serializeRational(value.ethUsd),
    maxCostUsd: serializeRational(value.maxCostUsd),
    priceUpdatedAt: value.priceUpdatedAt,
  };
}

function deserializeTransferCost(value: Record<string, unknown>): EstimatedTransferCost {
  const base = {
    transactionType: 'native-eth-transfer' as const,
    gasUnits: 21_000n as const,
    maxCostEth: deserializeRational(value.maxCostEth),
  };
  if (value.status === 'unavailable') {
    return { status: 'unavailable', ...base };
  }

  return {
    status: value.status as 'fresh' | 'stale',
    ...base,
    ethUsd: deserializeRational(value.ethUsd),
    maxCostUsd: deserializeRational(value.maxCostUsd),
    priceUpdatedAt: value.priceUpdatedAt as Date,
  };
}

function serializeTrend(value: FeeTrend): Record<string, unknown> {
  if (value.status !== 'available') return { ...value };
  return {
    status: value.status,
    windowMinutes: value.windowMinutes,
    percentChange: serializeRational(value.percentChange),
    currentMedianMaxFeeWei: serializeRational(value.currentMedianMaxFeeWei),
    previousMedianMaxFeeWei: serializeRational(value.previousMedianMaxFeeWei),
  };
}

function deserializeTrend(value: Record<string, unknown>): FeeTrend {
  if (value.status === 'insufficient-history') {
    return { status: 'insufficient-history', windowMinutes: 5 };
  }
  if (value.status === 'unavailable') {
    return {
      status: 'unavailable',
      windowMinutes: 5,
      reason: 'history-unavailable',
    };
  }
  return {
    status: 'available',
    windowMinutes: 5,
    percentChange: deserializeRational(value.percentChange),
    currentMedianMaxFeeWei: deserializeRational(value.currentMedianMaxFeeWei),
    previousMedianMaxFeeWei: deserializeRational(value.previousMedianMaxFeeWei),
  };
}

function serializeSnapshot(snapshot: FeeSnapshot): FeeSnapshotDocument {
  if (snapshot.recommendationState !== 'current') {
    throw new TypeError('Only current fee snapshots can be serialized');
  }
  return {
    timestamp: snapshot.timestamp,
    metadata: { network: snapshot.network },
    recommendationState: 'current',
    recommendedMaxFeeWei: snapshot.recommendedMaxFeeWei.toString(),
    recommendedPriorityFeeWei: snapshot.recommendedPriorityFeeWei.toString(),
    baseFeeWei: snapshot.baseFeeWei.toString(),
    effectiveGasPriceWei: snapshot.effectiveGasPriceWei.toString(),
    estimatedTransferCost: serializeTransferCost(snapshot.estimatedTransferCost),
    trend24h: serializeTrend(snapshot.trend24h),
    confidence: snapshot.confidence,
    sampleSize: snapshot.sampleSize,
    dataAgeMs: snapshot.dataAgeMs,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    status: snapshot.status,
  };
}

function deserializeSnapshot(document: FeeSnapshotDocument): FeeSnapshot {
  return {
    timestamp: document.timestamp,
    network: document.metadata.network,
    recommendationState: document.recommendationState,
    recommendedMaxFeeWei: BigInt(document.recommendedMaxFeeWei),
    recommendedPriorityFeeWei: BigInt(document.recommendedPriorityFeeWei),
    baseFeeWei: BigInt(document.baseFeeWei),
    effectiveGasPriceWei: BigInt(document.effectiveGasPriceWei),
    estimatedTransferCost: deserializeTransferCost(document.estimatedTransferCost),
    trend24h: deserializeTrend(document.trend24h),
    confidence: document.confidence,
    sampleSize: document.sampleSize,
    dataAgeMs: document.dataAgeMs,
    sourceUpdatedAt: document.sourceUpdatedAt,
    status: document.status,
  };
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(encoded: string): Cursor {
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
  } catch {
    throw new InvalidHistoryCursorError();
  }
}

export class MongoFeeSnapshotRepository implements FeeSnapshotRepository {
  constructor(private readonly manager: MongoDatabaseProvider) {}

  private collection(): Collection<FeeSnapshotDocument> {
    return this.manager.database().collection<FeeSnapshotDocument>(COLLECTION_NAME);
  }

  async initialize(): Promise<void> {
    try {
      const database = this.manager.database();
      const existing = await database
        .listCollections({ name: COLLECTION_NAME }, { nameOnly: true })
        .hasNext();
      if (!existing) {
        await database.createCollection(COLLECTION_NAME, {
          timeseries: {
            timeField: 'timestamp',
            metaField: 'metadata',
            granularity: 'seconds',
          },
          expireAfterSeconds: RETENTION_SECONDS,
        });
      }
    } catch (error) {
      this.fail(error);
    }
  }

  async insert(snapshot: FeeSnapshot): Promise<void> {
    if (snapshot.recommendationState !== 'current') return;
    try {
      await this.collection().insertOne(serializeSnapshot(snapshot));
    } catch (error) {
      this.fail(error);
    }
  }

  async findLatest(): Promise<FeeSnapshot | null> {
    try {
      const document = await this.collection().findOne(
        { 'metadata.network': 'ethereum-mainnet' },
        { sort: { timestamp: -1 } },
      );
      return document === null ? null : deserializeSnapshot(document);
    } catch (error) {
      this.failHistory(error);
    }
  }

  async findWindow(from: Date, to: Date): Promise<FeeSnapshot[]> {
    try {
      const documents = await this.collection()
        .find({
          'metadata.network': 'ethereum-mainnet',
          timestamp: { $gte: from, $lte: to },
        })
        .sort({ timestamp: 1, _id: 1 })
        .toArray();
      return documents.map(deserializeSnapshot);
    } catch (error) {
      this.failHistory(error);
    }
  }

  async findPage(query: FeeHistoryQuery): Promise<FeeHistoryPage> {
    try {
      const filter: Filter<FeeSnapshotDocument> = {
        'metadata.network': 'ethereum-mainnet',
        timestamp: { $gte: query.from, $lt: query.to },
      };

      if (query.cursor !== undefined) {
        const cursor = decodeCursor(query.cursor);
        if (
          cursor.from !== query.from.toISOString() ||
          cursor.to !== query.to.toISOString() ||
          cursor.limit !== query.limit
        ) {
          throw new InvalidHistoryCursorError();
        }
        filter.$or = [
          { timestamp: { $gt: new Date(cursor.afterTimestamp) } },
          {
            timestamp: new Date(cursor.afterTimestamp),
            _id: { $gt: new ObjectId(cursor.afterId) },
          },
        ];
      }

      const documents = await this.collection()
        .find(filter)
        .sort({ timestamp: 1, _id: 1 })
        .limit(query.limit + 1)
        .toArray();
      const hasMore = documents.length > query.limit;
      const pageDocuments = documents.slice(0, query.limit);
      const last = pageDocuments.at(-1);

      return {
        data: pageDocuments.map(deserializeSnapshot),
        nextCursor:
          hasMore && last?._id
            ? encodeCursor({
                v: 1,
                from: query.from.toISOString(),
                to: query.to.toISOString(),
                limit: query.limit,
                afterTimestamp: last.timestamp.toISOString(),
                afterId: last._id.toHexString(),
              })
            : null,
      };
    } catch (error) {
      if (error instanceof InvalidHistoryCursorError) throw error;
      this.failHistory(error);
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

  private failHistory(error: unknown): never {
    this.manager.markUnavailable();
    if (error instanceof InvalidHistoryCursorError) throw error;
    throw new FeeHistoryUnavailableError();
  }
}
