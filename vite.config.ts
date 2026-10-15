import { paraglideVitePlugin } from '@inlang/paraglide-js';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { nodeExternals } from 'rollup-plugin-node-externals';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/paraglide/**', '**/*.d.ts'],
      // lcov feeds Codecov; json-summary feeds the CI job summary.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // Floor set just below the measured level; ratchet upward as tests are added.
      thresholds: { statements: 98, branches: 95, functions: 90, lines: 98 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@util': path.resolve(import.meta.dirname, './src/util'),
      '@lib': path.resolve(import.meta.dirname, './src/lib'),
      '@schema': path.resolve(import.meta.dirname, './src/schema'),
      '@i18n': path.resolve(import.meta.dirname, './src/paraglide'),
      '@tests': path.resolve(import.meta.dirname, './tests'),
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
    rolldownOptions: {
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
