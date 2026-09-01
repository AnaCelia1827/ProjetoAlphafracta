import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeeHistory } from '@/hooks/use-fee-history';
import { fetchAllFeeHistory } from '@/lib/api/fetch-fee-history';
import type { HistoryRangeMinutes } from '@/types/fees';

vi.mock('@/lib/api/fetch-fee-history', () => ({
  fetchAllFeeHistory: vi.fn(),
}));

const fetchAllFeeHistoryMock = vi.mocked(fetchAllFeeHistory);
const oldPoint = {
  timestamp: '2026-08-31T01:00:00.000Z',
  recommendedMaxFeeGwei: 40,
  recommendedPriorityFeeGwei: 2,
  maxCostUsd: 1.5,
};
const baselinePoint = {
  ...oldPoint,
  timestamp: '2026-08-30T04:00:00.000Z',
  maxCostUsd: 1,
};

describe('useFeeHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([5, 15, 60, 360, 1440] as const)(
    'loads the exact %i-minute window and its 24-hour baseline',
    async (rangeMinutes: HistoryRangeMinutes) => {
      fetchAllFeeHistoryMock.mockResolvedValue([oldPoint]);

      const { result } = renderHook(() => useFeeHistory(rangeMinutes));

      await waitFor(() => expect(result.current.loading).toBe(false));
      const expectedCalls = rangeMinutes === 1440 ? 1 : 2;
      expect(fetchAllFeeHistoryMock).toHaveBeenCalledTimes(expectedCalls);

      const [baselineFrom, baselineTo] = fetchAllFeeHistoryMock.mock.calls[0]!;
      expect(baselineTo.getTime() - baselineFrom.getTime()).toBe(1440 * 60_000);

      if (rangeMinutes !== 1440) {
        const [selectedFrom, selectedTo] = fetchAllFeeHistoryMock.mock.calls[1]!;
        expect(selectedTo).toBe(baselineTo);
        expect(selectedTo.getTime() - selectedFrom.getTime()).toBe(rangeMinutes * 60_000);
      }

      expect(result.current.history).toEqual([oldPoint]);
      expect(result.current.baseline24h).toEqual([oldPoint]);
    },
  );

  it('does not label a previous range as the newly selected range', async () => {
    let rejectSelected!: (reason: unknown) => void;
    fetchAllFeeHistoryMock
      .mockResolvedValueOnce([oldPoint])
      .mockResolvedValueOnce([baselinePoint])
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectSelected = reject;
        }),
      );

    const { result, rerender } = renderHook(({ rangeMinutes }) => useFeeHistory(rangeMinutes), {
      initialProps: { rangeMinutes: 1440 as HistoryRangeMinutes },
    });
    await waitFor(() => expect(result.current.history).toEqual([oldPoint]));
    expect(result.current.baseline24h).toEqual([oldPoint]);

    rerender({ rangeMinutes: 5 });
    expect(result.current.loading).toBe(true);
    expect(result.current.history).toEqual([]);
    expect(result.current.baseline24h).toEqual([]);

    act(() => rejectSelected(new Error('history unavailable')));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.history).toEqual([]);
    expect(result.current.baseline24h).toEqual([]);
    expect(result.current.error).toBe('history unavailable');
  });

  it('ignores a stale request that resolves after the range changes', async () => {
    let resolveOldBaseline!: (points: (typeof oldPoint)[]) => void;
    fetchAllFeeHistoryMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOldBaseline = resolve;
        }),
      )
      .mockResolvedValueOnce([baselinePoint])
      .mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(({ rangeMinutes }) => useFeeHistory(rangeMinutes), {
      initialProps: { rangeMinutes: 1440 as HistoryRangeMinutes },
    });

    rerender({ rangeMinutes: 5 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.history).toEqual([]);
    expect(result.current.baseline24h).toEqual([baselinePoint]);

    act(() => resolveOldBaseline([oldPoint]));
    expect(result.current.history).toEqual([]);
    expect(result.current.baseline24h).toEqual([baselinePoint]);
  });
});
