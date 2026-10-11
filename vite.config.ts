import { paraglideVitePlugin } from '@inlang/paraglide-js';
/// <reference types="vitest/config" />
import path from 'node:path';
import { defineConfig } from 'vite';
import { nodeExternals } from 'rollup-plugin-node-externals';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/paraglide/**', 'src/tests/**', '**/*.spec.ts', '**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      // Floor set just below the measured baseline; ratchet upward as tests are added.
      thresholds: { statements: 65, branches: 80, functions: 45, lines: 65 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@util': path.resolve(import.meta.dirname, './src/util'),
      '@lib': path.resolve(import.meta.dirname, './src/lib'),
      '@schema': path.resolve(import.meta.dirname, './src/schema'),
      '@i18n': path.resolve(import.meta.dirname, './src/paraglide'),
    },
  },
  define: {
    __TEST_DATA__: JSON.stringify('./testdata'),
  },
  build: {
    target: 'es2022',
    lib: {
      entry: 'src/index.ts',
      fileName(_format, entryName) {
        const pathOffset = path.dirname(entryName) == '.' ? '' : `${path.dirname(entryName)}/`;
        return `${pathOffset}${path.basename(entryName)}.js`;
      },
    },
    rollupOptions: {
      output: [
        {
          dir: 'dist',
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
      ],
    },
  },
  plugins: [
    paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide' }),
    tsconfigPaths(),
    nodeExternals(),
  ],
});
