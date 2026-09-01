/**
 * Testes de infraestrutura MongoDB: especificam serialização exata, índices,
 * cursor opaco, canonicidade de reorg e degradação com banco local controlado.
 */
import type { Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FeeHistoryUnavailableError } from '../../src/domain/fees/fee-trend.js';
import * as clientModule from '../../src/infrastructure/mongodb/mongo-client.js';
import * as feeRepositoryModule from '../../src/infrastructure/mongodb/mongo-fee-snapshot-repository.js';
import * as blockRepositoryModule from '../../src/infrastructure/mongodb/mongo-observed-block-repository.js';

const mongoUri =
  process.env.TEST_MONGODB_URI ??
  'mongodb://alphractal:alphractal_dev_password@127.0.0.1:27017/?authSource=admin';
const databaseName = `alphractal_test_${process.pid}_${Date.now()}`;
const timestamp = new Date('2026-08-30T18:42:15.000Z');
const hashA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const hashB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

interface Manager {
  connect(): Promise<void>;
  close(): Promise<void>;
  database(): Db;
  isAvailable(): boolean;
}

interface FeeRepository {
  initialize(): Promise<void>;
  insert(snapshot: ReturnType<typeof feeSnapshot>): Promise<void>;
  findLatest(): Promise<ReturnType<typeof feeSnapshot> | null>;
  findWindow(from: Date, to: Date): Promise<Array<ReturnType<typeof feeSnapshot>>>;
  findPage(query: {
    from: Date;
    to: Date;
    limit: number;
    cursor?: string;
  }): Promise<{ data: Array<ReturnType<typeof feeSnapshot>>; nextCursor: string | null }>;
}

interface BlockRepository {
  initialize(): Promise<void>;
  saveCanonical(block: ReturnType<typeof blockSummary>): Promise<void>;
  markNoncanonical(
    network: 'ethereum-mainnet',
    number: bigint,
    exceptHash: `0x${string}`,
  ): Promise<void>;
  findRecent(limit: number): Promise<Array<ReturnType<typeof blockSummary>>>;
  findPage(query: { limit: number; cursor?: string }): Promise<{
    data: Array<ReturnType<typeof blockSummary>>;
    nextCursor: string | null;
  }>;
  findCanonicalBefore(timestamp: Date, from: Date): Promise<Array<ReturnType<typeof blockSummary>>>;
  updateFinality(
    changes: Array<{ number: bigint; hash: `0x${string}`; finality: 'safe' | 'finalized' }>,
  ): Promise<void>;
}

/** Cria razão para fixtures de persistência sem converter precisão a Number. */
function rational(numerator: bigint, denominator = 1n) {
  return { numerator, denominator };
}

/** Cria snapshot current persistível com valores variáveis para paginação e TTL. */
function feeSnapshot(
  instant = timestamp,
  recommendedMaxFeeWei = 32_400_000_000n,
  recommendationState: 'current' | 'last-known' = 'current',
) {
  return {
    timestamp: instant,
    network: 'ethereum-mainnet' as const,
    recommendationState,
    recommendedMaxFeeWei,
    recommendedPriorityFeeWei: 1_800_000_000n,
    baseFeeWei: 28_700_000_000n,
    effectiveGasPriceWei: 30_500_000_000n,
    estimatedTransferCost: {
      status: 'unavailable' as const,
      transactionType: 'native-eth-transfer' as const,
      gasUnits: 21_000n as const,
      maxCostEth: rational(6804n, 10_000_000n),
    },
    trend24h: { status: 'insufficient-history' as const, windowMinutes: 5 as const },
    confidence: {
      level: recommendationState === 'current' ? ('high' as const) : ('unavailable' as const),
      reasons: ['fresh-data' as const, 'stable-fees' as const, 'strong-sample' as const],
    },
    sampleSize: 500,
    dataAgeMs: 100,
    sourceUpdatedAt: { mempool: instant, ethereum: instant },
    status: {
      mempool: 'fresh' as const,
      ethereum: 'fresh' as const,
      price: 'unavailable' as const,
      persistence: 'available' as const,
    },
  };
}

/** Cria bloco canônico persistível com identidade e finality ajustáveis por cenário. */
function blockSummary(
  number: bigint,
  hash: `0x${string}` = hashA,
  instant = new Date(timestamp.getTime() + Number(number)),
) {
  return {
    network: 'ethereum-mainnet' as const,
    number,
    hash,
    timestamp: instant,
    finality: 'latest' as const,
    feeLevel: 'normal' as const,
    baseFeeWei: 100n,
    medianPriorityFeeWei: rational(2n),
    effectiveGasPriceWei: rational(102n),
    gasUsed: 75n,
    gasLimit: 100n,
    utilization: rational(75n),
    transactionCount: 1,
    provider: 'alchemy' as const,
  };
}

let manager: Manager | undefined;
let database: Db | undefined;
let feeRepository: FeeRepository | undefined;
let blockRepository: BlockRepository | undefined;

beforeAll(async () => {
  expect(clientModule).toHaveProperty('MongoClientManager');
  expect(feeRepositoryModule).toHaveProperty('MongoFeeSnapshotRepository');
  expect(blockRepositoryModule).toHaveProperty('MongoObservedBlockRepository');

  const ManagerConstructor = (
    clientModule as unknown as {
      MongoClientManager: new (options: {
        uri: string;
        databaseName: string;
        serverSelectionTimeoutMs: number;
      }) => Manager;
    }
  ).MongoClientManager;
  manager = new ManagerConstructor({
    uri: mongoUri,
    databaseName,
    serverSelectionTimeoutMs: 2_000,
  });
  await manager.connect();
  database = manager.database();

  const FeeRepositoryConstructor = (
    feeRepositoryModule as unknown as {
      MongoFeeSnapshotRepository: new (manager: Manager) => FeeRepository;
    }
  ).MongoFeeSnapshotRepository;
  const BlockRepositoryConstructor = (
    blockRepositoryModule as unknown as {
      MongoObservedBlockRepository: new (manager: Manager) => BlockRepository;
    }
  ).MongoObservedBlockRepository;
  feeRepository = new FeeRepositoryConstructor(manager);
  blockRepository = new BlockRepositoryConstructor(manager);
  await feeRepository.initialize();
  await blockRepository.initialize();
});

afterAll(async () => {
  if (manager === undefined) return;
  if (manager.isAvailable()) await manager.database().dropDatabase();
  await manager.close();
});

describe('MongoFeeSnapshotRepository', () => {
  it('creates an idempotent 30-day time-series collection', async () => {
    await feeRepository!.initialize();
    const collection = await database!.listCollections({ name: 'fee_snapshots' }).next();

    expect(collection).not.toBeNull();
    if (collection === null || !('options' in collection)) {
      throw new TypeError('Expected complete collection information');
    }
    const options = collection.options;
    if (options === undefined) {
      throw new TypeError('Expected collection options');
    }
    expect(options.timeseries).toMatchObject({
      timeField: 'timestamp',
      metaField: 'metadata',
    });
    expect(Number(options.expireAfterSeconds)).toBe(2_592_000);
  });

  it('persists only current snapshots and restores the latest value', async () => {
    await feeRepository!.insert(feeSnapshot());
    await feeRepository!.insert(
      feeSnapshot(new Date(timestamp.getTime() + 1_000), 40n, 'last-known'),
    );

    expect(await database!.collection('fee_snapshots').countDocuments()).toBe(1);
    expect(await feeRepository!.findLatest()).toMatchObject({
      recommendationState: 'current',
      recommendedMaxFeeWei: 32_400_000_000n,
    });
  });

  it('reads an exclusive time window in ascending order', async () => {
    const second = new Date(timestamp.getTime() + 2_000);
    await feeRepository!.insert(feeSnapshot(second, 35n));

    const found = await feeRepository!.findWindow(
      new Date(timestamp.getTime() - 1),
      new Date(second.getTime() + 1),
    );

    expect(found.map((item) => item.timestamp)).toEqual([timestamp, second]);
  });

  it('paginates with an opaque cursor bound to the original query', async () => {
    const query = {
      from: new Date(timestamp.getTime() - 1),
      to: new Date(timestamp.getTime() + 10_000),
      limit: 1,
    };
    const first = await feeRepository!.findPage(query);

    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await feeRepository!.findPage({
      ...query,
      cursor: first.nextCursor!,
    });
    expect(second.data).toHaveLength(1);
    expect(second.data[0]!.timestamp.getTime()).toBeGreaterThan(first.data[0]!.timestamp.getTime());

    await expect(
      feeRepository!.findPage({
        ...query,
        limit: 2,
        cursor: first.nextCursor!,
      }),
    ).rejects.toThrow(/cursor/i);
  });
});

describe('MongoObservedBlockRepository', () => {
  it('creates canonical uniqueness, hash, window and TTL indexes', async () => {
    await blockRepository!.initialize();
    const indexes = await database!.collection('observed_blocks').indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'network_hash_unique', unique: true }),
        expect.objectContaining({
          name: 'canonical_network_number_unique',
          unique: true,
          partialFilterExpression: { canonical: true },
        }),
        expect.objectContaining({ name: 'canonical_window' }),
        expect.objectContaining({ name: 'ttl_30_days', expireAfterSeconds: 2_592_000 }),
      ]),
    );
  });

  it('keeps the former hash noncanonical during a reorg', async () => {
    await blockRepository!.saveCanonical(blockSummary(10n, hashA));
    await blockRepository!.markNoncanonical('ethereum-mainnet', 10n, hashB);
    await blockRepository!.saveCanonical(blockSummary(10n, hashB));

    const documents = await database!
      .collection('observed_blocks')
      .find({ network: 'ethereum-mainnet' })
      .sort({ hash: 1 })
      .toArray();
    expect(documents.map((document) => [document.hash, document.canonical])).toEqual([
      [hashA, false],
      [hashB, true],
    ]);
    expect((await blockRepository!.findRecent(20)).map((block) => block.hash)).toEqual([hashB]);
  });

  it('queries only canonical prior context and updates finality', async () => {
    const block = blockSummary(11n, hashA, new Date(timestamp.getTime() + 11_000));
    await blockRepository!.saveCanonical(block);

    const context = await blockRepository!.findCanonicalBefore(
      new Date(timestamp.getTime() + 12_000),
      new Date(timestamp.getTime() - 1),
    );
    expect(context.map((item) => item.number)).toEqual([10n, 11n]);

    await blockRepository!.updateFinality([{ number: 11n, hash: hashA, finality: 'safe' }]);
    expect((await blockRepository!.findRecent(20))[0]).toMatchObject({
      number: 11n,
      finality: 'safe',
    });
  });

  it('paginates canonical blocks with a stable opaque cursor', async () => {
    await database!.collection('observed_blocks').deleteMany({});
    for (const number of [101n, 102n, 103n, 104n, 105n]) {
      const hash = `0x${number.toString(16).padStart(64, '0')}` as `0x${string}`;
      await blockRepository!.saveCanonical(blockSummary(number, hash));
    }

    const first = await blockRepository!.findPage({ limit: 2 });
    expect(first.data.map((block) => block.number)).toEqual([105n, 104n]);
    expect(first.nextCursor).toEqual(expect.any(String));

    await blockRepository!.saveCanonical(
      blockSummary(106n, `0x${'6a'.padStart(64, '0')}`),
    );
    const second = await blockRepository!.findPage({
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.data.map((block) => block.number)).toEqual([103n, 102n]);
    expect(second.data.some((block) => block.number === 106n)).toBe(false);

    await expect(
      blockRepository!.findPage({ limit: 3, cursor: first.nextCursor! }),
    ).rejects.toThrow(/cursor/i);
  });
});

describe('Mongo availability', () => {
  it('reports a stable history outage after the client closes', async () => {
    await database!.dropDatabase();
    await manager!.close();

    expect(manager!.isAvailable()).toBe(false);
    await expect(feeRepository!.findWindow(new Date(0), new Date())).rejects.toBeInstanceOf(
      FeeHistoryUnavailableError,
    );
  });
});
