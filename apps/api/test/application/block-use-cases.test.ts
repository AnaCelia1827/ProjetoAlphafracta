/**
 * Testes de aplicação de blocos: protegem observação, backfill, busca pontual,
 * reorg e finality usando fakes para isolar as regras de HTTP e MongoDB reais.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  BlockNotFoundError,
  BlocksUnavailableError,
  EthereumProviderUnavailableError,
  InvalidBlockIdentifierError,
  PersistenceUnavailableError,
  PreEip1559BlockUnsupportedError,
} from '../../src/application/common/errors.js';
import type { LiveEvent } from '../../src/application/common/live-event-publisher.js';
import {
  GetBlockByIdentifier,
  parseBlockIdentifier,
} from '../../src/application/blocks/get-block-by-identifier.js';
import { GetBlockHistory } from '../../src/application/blocks/get-block-history.js';
import { GetRecentBlocks } from '../../src/application/blocks/get-recent-blocks.js';
import { ObserveBlock } from '../../src/application/blocks/observe-block.js';
import { PrimeRecentBlocks } from '../../src/application/blocks/prime-recent-blocks.js';
import { UpdateBlockFinality } from '../../src/application/blocks/update-block-finality.js';
import type {
  BlockIdentifier,
  FinalityHeads,
  NormalizedBlock,
} from '../../src/domain/blocks/models.js';
import { RecentBlockWindow } from '../../src/domain/blocks/recent-block-window.js';
import { FakeObservedBlockRepository } from '../helpers/fakes.js';
import { blockSummary, normalizedBlock } from '../helpers/fixtures.js';

const hashA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const hashB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/** Monta cenário controlado de blocos, janela, repositório e publicação ao vivo. */
function setup() {
  const repository = new FakeObservedBlockRepository();
  const window = new RecentBlockWindow(20);
  const events: LiveEvent[] = [];
  const blocks = new Map<string, NormalizedBlock>();
  const heads: FinalityHeads = {
    safe: { number: 19_999_999n, hash: hashA },
    finalized: { number: 19_999_998n, hash: hashB },
  };
  const source = {
    getBlock: vi.fn(async (identifier: BlockIdentifier) => blocks.get(String(identifier)) ?? null),
    getLatestBlockNumber: vi.fn(async () => 20_000_019n),
    getFinalityHeads: vi.fn(async () => heads),
  };
  const feeMonitor = { trigger: vi.fn(async () => undefined) };
  const publisher = { publish: (event: LiveEvent) => events.push(event) };
  const observe = new ObserveBlock({ repository, window, source, publisher, feeMonitor });
  return { repository, window, events, blocks, heads, source, feeMonitor, publisher, observe };
}

describe('block observation', () => {
  it('analyzes one hour of prior context, stores, publishes and triggers fees once', async () => {
    const context = setup();
    const block = normalizedBlock(20_000_000n);
    context.blocks.set(String(block.number), block);
    context.repository.context = Array.from({ length: 20 }, (_, index) =>
      blockSummary(19_999_900n + BigInt(index)),
    );

    const result = await context.observe.execute(block.number);

    expect(context.repository.saved).toEqual([result]);
    expect(context.window.values()).toEqual([result]);
    expect(context.events).toEqual([{ type: 'block-added', block: result }]);
    expect(context.feeMonitor.trigger).toHaveBeenCalledTimes(1);
    expect(result.feeLevel).toBe('high');
    expect(context.repository.contextQueries).toEqual([
      {
        timestamp: block.timestamp,
        from: new Date(block.timestamp.getTime() - 60 * 60 * 1_000),
      },
    ]);
  });

  it('marks the former hash noncanonical when the same height is replaced', async () => {
    const context = setup();
    context.window.upsert(blockSummary(20_000_000n, { hash: hashA }));
    context.blocks.set(String(20_000_000n), normalizedBlock(20_000_000n, hashB));

    const result = await context.observe.execute(20_000_000n);

    expect(context.repository.marked).toEqual([{ number: 20_000_000n, exceptHash: hashB }]);
    expect(result.hash).toBe(hashB);
    expect(context.events).toEqual([{ type: 'block-added', block: result }]);
  });

  it('keeps the in-memory observation and event when persistence is degraded', async () => {
    const context = setup();
    context.blocks.set(String(20_000_000n), normalizedBlock(20_000_000n));
    context.repository.error = new PersistenceUnavailableError();

    const result = await context.observe.execute(20_000_000n);

    expect(context.window.values()).toEqual([result]);
    expect(context.events).toEqual([{ type: 'block-added', block: result }]);
  });
});

describe('recent block bootstrap and reads', () => {
  it('restores persisted blocks and backfills missing heights oldest first', async () => {
    const context = setup();
    context.repository.recent = [blockSummary(20_000_019n), blockSummary(20_000_018n)];
    const order: bigint[] = [];
    context.source.getBlock.mockImplementation(async (identifier) => {
      if (typeof identifier !== 'bigint') return null;
      order.push(identifier);
      return normalizedBlock(identifier);
    });
    const prime = new PrimeRecentBlocks({
      repository: context.repository,
      window: context.window,
      source: context.source,
      observe: context.observe,
    });

    await prime.execute();

    expect(context.window.values()).toHaveLength(20);
    expect(order).toEqual(Array.from({ length: 18 }, (_, index) => 20_000_000n + BigInt(index)));
    expect(context.feeMonitor.trigger).not.toHaveBeenCalled();
  });

  it('preserves restored blocks when Alchemy becomes unavailable', async () => {
    const context = setup();
    context.repository.recent = [blockSummary(20_000_019n)];
    context.source.getLatestBlockNumber.mockRejectedValue(new EthereumProviderUnavailableError());
    const prime = new PrimeRecentBlocks({
      repository: context.repository,
      window: context.window,
      source: context.source,
      observe: context.observe,
    });

    await prime.execute();
    expect(context.window.values()).toEqual(context.repository.recent);
  });

  it('returns newest first or a distinct empty-cache error', async () => {
    const window = new RecentBlockWindow();
    const getRecent = new GetRecentBlocks(window);
    await expect(getRecent.execute()).rejects.toBeInstanceOf(BlocksUnavailableError);

    window.upsert(blockSummary(20_000_000n));
    window.upsert(blockSummary(20_000_001n));
    expect((await getRecent.execute()).map((block) => block.number)).toEqual([
      20_000_001n,
      20_000_000n,
    ]);
  });
});

describe('block history', () => {
  it('returns a repository page and maps persistence failure', async () => {
    const context = setup();
    context.repository.page = {
      data: [blockSummary(20_000_010n)],
      nextCursor: 'next-page',
    };
    const history = new GetBlockHistory(context.repository);

    await expect(history.execute({ limit: 10 })).resolves.toEqual(context.repository.page);

    context.repository.error = new PersistenceUnavailableError();
    await expect(history.execute({ limit: 10 })).rejects.toBeInstanceOf(BlocksUnavailableError);
  });
});

describe('block lookup', () => {
  it('parses only canonical decimal numbers and 32-byte hashes', () => {
    expect(parseBlockIdentifier('12965000')).toBe(12_965_000n);
    expect(parseBlockIdentifier(hashA)).toBe(hashA);
    expect(() => parseBlockIdentifier('012965000')).toThrow(InvalidBlockIdentifierError);
    expect(() => parseBlockIdentifier('latest')).toThrow(InvalidBlockIdentifierError);
  });

  it('rejects pre-EIP-1559 numbers before calling Alchemy', async () => {
    const context = setup();
    const lookup = new GetBlockByIdentifier({
      repository: context.repository,
      source: context.source,
    });

    await expect(lookup.execute('12964999')).rejects.toBeInstanceOf(
      PreEip1559BlockUnsupportedError,
    );
    expect(context.source.getBlock).not.toHaveBeenCalled();
  });

  it('analyzes a searched block without changing memory or persistence', async () => {
    const context = setup();
    const block = normalizedBlock(20_000_000n);
    context.blocks.set(String(block.number), block);
    const lookup = new GetBlockByIdentifier({
      repository: context.repository,
      source: context.source,
    });

    const result = await lookup.execute(String(block.number));

    expect(result.number).toBe(block.number);
    expect(context.window.values()).toEqual([]);
    expect(context.repository.saved).toEqual([]);
  });

  it('maps missing and pre-EIP-1559 hash results to distinct errors', async () => {
    const context = setup();
    const lookup = new GetBlockByIdentifier({
      repository: context.repository,
      source: context.source,
    });
    await expect(lookup.execute(hashA)).rejects.toBeInstanceOf(BlockNotFoundError);

    context.blocks.set(hashA, normalizedBlock(20_000_000n, hashA));
    context.blocks.get(hashA)!.baseFeePerGasWei = null;
    await expect(lookup.execute(hashA)).rejects.toBeInstanceOf(PreEip1559BlockUnsupportedError);
  });

  it('preserves the typed Ethereum outage for the HTTP boundary', async () => {
    const context = setup();
    context.source.getBlock.mockRejectedValue(new EthereumProviderUnavailableError());
    const lookup = new GetBlockByIdentifier({
      repository: context.repository,
      source: context.source,
    });

    await expect(lookup.execute(hashA)).rejects.toBeInstanceOf(EthereumProviderUnavailableError);
  });
});

describe('finality updates', () => {
  it('publishes only real promotions and never downgrades a block', async () => {
    const context = setup();
    context.window.upsert(blockSummary(19_999_998n, { hash: hashB, finality: 'safe' }));
    context.window.upsert(blockSummary(19_999_999n, { hash: hashA, finality: 'safe' }));
    context.window.upsert(blockSummary(20_000_000n, { finality: 'latest' }));
    const update = new UpdateBlockFinality({
      source: context.source,
      repository: context.repository,
      window: context.window,
      publisher: context.publisher,
    });

    const changes = await update.execute();

    expect(changes).toEqual([{ number: 19_999_998n, hash: hashB, finality: 'finalized' }]);
    expect(context.repository.finalityChanges).toEqual([changes]);
    expect(context.events).toEqual([{ type: 'block-status-changed', change: changes[0] }]);
  });

  it('preserves state when finality heads are unavailable', async () => {
    const context = setup();
    context.window.upsert(blockSummary(20_000_000n));
    context.source.getFinalityHeads.mockRejectedValue(new EthereumProviderUnavailableError());
    const update = new UpdateBlockFinality({
      source: context.source,
      repository: context.repository,
      window: context.window,
      publisher: context.publisher,
    });

    expect(await update.execute()).toEqual([]);
    expect(context.repository.finalityChanges).toEqual([]);
    expect(context.events).toEqual([]);
  });
});
