import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';

describe('loadConfig', () => {
  it('uses the default port when MONGODB_URI is absent', () => {
    expect(loadConfig({})).toEqual({ PORT: 3001 });
  });

  it.each(['mongodb://localhost:27017/alphractal', 'mongodb+srv://cluster.example.com/alphractal'])(
    'accepts a valid MongoDB URI with the supported scheme: %s',
    (MONGODB_URI) => {
      expect(loadConfig({ MONGODB_URI })).toMatchObject({ MONGODB_URI });
    },
  );

  it('rejects a malformed supplied MONGODB_URI', () => {
    expect(() => loadConfig({ MONGODB_URI: 'not-a-url' })).toThrow();
  });

  it.each(['https://example.com/alphractal', 'postgres://localhost/alphractal'])(
    'rejects a structurally valid URI with an unsupported scheme: %s',
    (MONGODB_URI) => {
      expect(() => loadConfig({ MONGODB_URI })).toThrow();
    },
  );
});
