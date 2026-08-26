import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';

describe('loadConfig', () => {
  it('uses the default port when MONGODB_URI is absent', () => {
    expect(loadConfig({})).toEqual({ PORT: 3001 });
  });

  it.each([
    'mongodb://localhost:27017/alphractal',
    'mongodb://mongo-1:27017,mongo-2:27018/alphractal?replicaSet=rs0',
    'mongodb+srv://cluster.example.com/alphractal',
  ])('accepts a valid MongoDB URI with the supported scheme: %s', (MONGODB_URI) => {
    expect(loadConfig({ MONGODB_URI })).toMatchObject({ MONGODB_URI });
  });

  it.each(['', 'not-a-url', 'mongodb://', 'mongodb+srv://'])(
    'rejects a malformed supplied MONGODB_URI: %s',
    (MONGODB_URI) => {
      expect(() => loadConfig({ MONGODB_URI })).toThrow();
    },
  );

  it.each(['https://example.com/alphractal', 'postgres://localhost/alphractal'])(
    'rejects a structurally valid URI with an unsupported scheme: %s',
    (MONGODB_URI) => {
      expect(() => loadConfig({ MONGODB_URI })).toThrow();
    },
  );
});
