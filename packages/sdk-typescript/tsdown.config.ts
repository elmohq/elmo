import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: { sourcemap: true },
  entry: ['src/index.ts', 'src/calls/index.ts', 'src/types/index.ts'],
  fixedExtension: true,
  format: 'esm',
  outputOptions: { sourcemapExcludeSources: true },
  sourcemap: true,
});
