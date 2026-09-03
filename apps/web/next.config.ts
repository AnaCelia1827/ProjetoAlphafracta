import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { resolveApiServerUrl } from './src/lib/api/server-config';

const apiServerUrl = resolveApiServerUrl(process.env, process.env.NODE_ENV);
const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ['@alphractal/contracts'],
  experimental: {
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    },
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiServerUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
