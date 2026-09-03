// @vitest-environment node

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('production Next.js output', () => {
  it('uses standalone output rooted at the monorepo', () => {
    expect(nextConfig.output).toBe('standalone');
    expect(nextConfig.outputFileTracingRoot).toBe(
      fileURLToPath(new URL('../../..', import.meta.url)),
    );
  });
});
