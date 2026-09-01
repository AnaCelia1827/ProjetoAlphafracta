import type { NextConfig } from 'next';
import { resolveApiServerUrl } from './src/lib/api/server-config';

const apiServerUrl = resolveApiServerUrl(process.env, process.env.NODE_ENV);
const nextConfig: NextConfig = {
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
