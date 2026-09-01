import { describe, expect, it } from 'vitest';
import { reduceLiveEvent } from '@/lib/live/live-reducer';
import { blockFixture } from './fixtures';

describe('live reducer', () => {
  it('replaces the old hash when the same block number reorgs', () => {
    const replacement = {
      ...blockFixture,
      hash: `0x${'b'.repeat(64)}`,
    };
    const state = { fee: null, blocks: [blockFixture] };

    const next = reduceLiveEvent(state, {
      id: `block:${replacement.number}:${replacement.hash}`,
      event: 'block-added',
      data: { data: replacement },
    });

    expect(next.blocks).toEqual([replacement]);
  });

  it('ignores finality updates for a different hash', () => {
    const state = { fee: null, blocks: [blockFixture] };

    const next = reduceLiveEvent(state, {
      id: `block-status:${blockFixture.number}:safe`,
      event: 'block-status-changed',
      data: {
        data: {
          number: blockFixture.number,
          hash: `0x${'c'.repeat(64)}`,
          finality: 'safe',
        },
      },
    });

    expect(next).toEqual(state);
  });
});
