/**
 * Testes do domínio de blocos: especificam gorjetas, análise, percentis,
 * finality e memória de reorg com entradas exatas e sem adaptadores externos.
 */
import { describe, expect, it } from 'vitest';

import * as analyzer from '../../src/domain/blocks/block-analyzer.js';
import * as feeLevel from '../../src/domain/blocks/block-fee-level.js';
import * as finality from '../../src/domain/blocks/block-finality.js';
import * as recentWindow from '../../src/domain/blocks/recent-block-window.js';

const hashA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const hashB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const timestamp = new Date('2026-08-30T18:42:15.000Z');

type Callable = (...arguments_: unknown[]) => unknown;

/** Obtém export de domínio sob teste sem acoplar as fixtures ao tipo de módulo. */
function callable(module: object, name: string): Callable {
  expect(module).toHaveProperty(name);
  return (module as Record<string, Callable>)[name]!;
}

/** Cria bloco mínimo EIP-1559 e permite variar somente o invariante do cenário. */
function normalizedBlock(overrides: Record<string, unknown> = {}) {
  return {
    number: 23_548_192n,
    hash: hashA,
    timestamp,
    baseFeePerGasWei: 100n,
    gasUsed: 75n,
    gasLimit: 100n,
    transactions: [],
    ...overrides,
  };
}

/** Cria resumo canônico compacto usado como histórico de classificação e janela. */
function summary(
  number: bigint,
  effectiveGasPriceWei = { numerator: number, denominator: 1n },
  hash = `0x${number.toString(16).padStart(64, '0')}`,
) {
  return {
    network: 'ethereum-mainnet',
    number,
    hash,
    timestamp: new Date(timestamp.getTime() + Number(number)),
    finality: 'latest',
    feeLevel: 'normal',
    baseFeeWei: 100n,
    medianPriorityFeeWei: { numerator: 1n, denominator: 1n },
    effectiveGasPriceWei,
    gasUsed: 75n,
    gasLimit: 100n,
    utilization: { numerator: 75n, denominator: 1n },
    transactionCount: 1,
    provider: 'alchemy',
  };
}

describe('analyzeBlock', () => {
  it('calculates capped EIP-1559 and legacy effective tips', () => {
    const result = callable(analyzer, 'analyzeBlock')(
      normalizedBlock({
        transactions: [
          { kind: 'eip1559', maxFeePerGasWei: 103n, maxPriorityFeePerGasWei: 20n },
          { kind: 'legacy', gasPriceWei: 112n },
          { kind: 'eip1559', maxFeePerGasWei: 140n, maxPriorityFeePerGasWei: 20n },
        ],
      }),
      { finality: 'latest', feeLevel: 'normal' },
    );

    expect(result).toMatchObject({
      medianPriorityFeeWei: { numerator: 12n, denominator: 1n },
      effectiveGasPriceWei: { numerator: 112n, denominator: 1n },
      utilization: { numerator: 75n, denominator: 1n },
      transactionCount: 3,
    });
  });

  it('uses the arithmetic mean for an even median', () => {
    const result = callable(analyzer, 'analyzeBlock')(
      normalizedBlock({
        transactions: [
          { kind: 'legacy', gasPriceWei: 101n },
          { kind: 'legacy', gasPriceWei: 102n },
        ],
      }),
      { finality: 'safe', feeLevel: 'low' },
    );

    expect(result).toMatchObject({
      medianPriorityFeeWei: { numerator: 3n, denominator: 2n },
      effectiveGasPriceWei: { numerator: 203n, denominator: 2n },
      finality: 'safe',
      feeLevel: 'low',
    });
  });

  it('uses zero priority for an empty valid-tip set', () => {
    const result = callable(analyzer, 'analyzeBlock')(
      normalizedBlock({
        transactions: [{ kind: 'legacy', gasPriceWei: 99n }],
      }),
      { finality: 'latest', feeLevel: 'unavailable' },
    );

    expect(result).toMatchObject({
      medianPriorityFeeWei: { numerator: 0n, denominator: 1n },
      effectiveGasPriceWei: { numerator: 100n, denominator: 1n },
      transactionCount: 1,
    });
  });

  it('rejects a zero gas limit and a pre-EIP-1559 block', () => {
    const analyze = callable(analyzer, 'analyzeBlock');

    expect(() =>
      analyze(normalizedBlock({ gasLimit: 0n }), {
        finality: 'latest',
        feeLevel: 'normal',
      }),
    ).toThrow(/gas limit/i);
    expect(() =>
      analyze(normalizedBlock({ baseFeePerGasWei: null }), {
        finality: 'latest',
        feeLevel: 'normal',
      }),
    ).toThrow(/EIP-1559/i);
  });
});

describe('classifyBlockFeeLevel', () => {
  const context = Array.from({ length: 20 }, (_, index) =>
    summary(BigInt(index + 1), { numerator: BigInt(index + 1), denominator: 1n }),
  );

  it('requires at least 20 prior canonical blocks', () => {
    expect(
      callable(feeLevel, 'classifyBlockFeeLevel')(
        { numerator: 10n, denominator: 1n },
        context.slice(0, 19),
      ),
    ).toBe('unavailable');
  });

  it.each([
    [4n, 'low'],
    [5n, 'normal'],
    [14n, 'normal'],
    [15n, 'elevated'],
    [17n, 'elevated'],
    [18n, 'high'],
  ])('classifies %s at the documented boundaries', (value, expected) => {
    expect(
      callable(feeLevel, 'classifyBlockFeeLevel')({ numerator: value, denominator: 1n }, context),
    ).toBe(expected);
  });
});

describe('resolveBlockFinality', () => {
  it('resolves latest, safe and finalized against canonical heads', () => {
    const resolve = callable(finality, 'resolveBlockFinality');

    expect(
      resolve(
        { number: 11n, hash: hashA },
        {
          safe: { number: 10n, hash: hashA },
          finalized: { number: 9n, hash: hashA },
        },
      ),
    ).toBe('latest');
    expect(
      resolve(
        { number: 10n, hash: hashA },
        {
          safe: { number: 10n, hash: hashA },
          finalized: { number: 9n, hash: hashA },
        },
      ),
    ).toBe('safe');
    expect(
      resolve(
        { number: 9n, hash: hashA },
        {
          safe: { number: 10n, hash: hashA },
          finalized: { number: 9n, hash: hashA },
        },
      ),
    ).toBe('finalized');
  });

  it('does not promote an exact-height hash mismatch', () => {
    expect(
      callable(finality, 'resolveBlockFinality')(
        { number: 10n, hash: hashB },
        {
          safe: { number: 10n, hash: hashA },
          finalized: { number: 9n, hash: hashA },
        },
      ),
    ).toBe('latest');
  });
});

describe('RecentBlockWindow', () => {
  it('keeps only the 20 newest blocks in descending order', () => {
    expect(recentWindow).toHaveProperty('RecentBlockWindow');
    const Window = (recentWindow as Record<string, new () => object>).RecentBlockWindow!;
    const window = new Window() as {
      upsert(block: object): unknown;
      values(): Array<{ number: bigint }>;
    };

    for (let number = 1n; number <= 25n; number += 1n) {
      window.upsert(summary(number));
    }

    expect(window.values()).toHaveLength(20);
    expect(window.values().map((block) => block.number)).toEqual([
      25n,
      24n,
      23n,
      22n,
      21n,
      20n,
      19n,
      18n,
      17n,
      16n,
      15n,
      14n,
      13n,
      12n,
      11n,
      10n,
      9n,
      8n,
      7n,
      6n,
    ]);
  });

  it('is idempotent by hash and reports a same-number replacement', () => {
    expect(recentWindow).toHaveProperty('RecentBlockWindow');
    const Window = (recentWindow as Record<string, new () => object>).RecentBlockWindow!;
    const window = new Window() as {
      upsert(block: object): { current: { hash: string }; replaced: { hash: string } | null };
    };
    const original = summary(10n, undefined, hashA);

    expect(window.upsert(original).replaced).toBeNull();
    expect(window.upsert(original).replaced).toBeNull();
    expect(window.upsert(summary(10n, undefined, hashB))).toEqual({
      current: expect.objectContaining({ hash: hashB }),
      replaced: expect.objectContaining({ hash: hashA }),
    });
  });
});
