import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  clean: true,
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  splitting: false,
  treeshake: true,
  dts: false,
  noExternal: ['@alphractal/contracts'],
});
