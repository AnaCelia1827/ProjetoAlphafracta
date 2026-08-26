import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';

describe('loadConfig', () => {
  it('uses the default port when MONGODB_URI is absent', () => {
    expect(loadConfig({})).toEqual({ PORT: 3001 });
  });

  it('rejects an invalid supplied MONGODB_URI', () => {
    expect(() => loadConfig({ MONGODB_URI: 'not-a-url' })).toThrow();
  });
});
