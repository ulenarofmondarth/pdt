import { paraglideVitePlugin } from '@inlang/paraglide-js';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { nodeExternals } from 'rollup-plugin-node-externals';
import tsconfigPaths from 'vite-tsconfig-paths';

import type { Plugin } from 'vite';

const { version } = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf8')) as {
  version: string;
};

/**
 * Makes the CLI entry point executable after every build, including each rebuild in watch mode,
 * which writes the file afresh without the bit.
 */
function executableEntry(): Plugin {
  return {
    name: 'pdt:executable-entry',
    writeBundle(options) {
      fs.chmodSync(path.join(options.dir ?? 'dist', 'index.js'), 0o755);
    },
  };
}

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/paraglide/**', '**/*.d.ts'],
      // lcov feeds Codecov, with paths from the repository root; json-summary feeds the CI job summary.
      reporter: ['text', 'html', ['lcov', { projectRoot: '../..' }], 'json-summary'],
      // Floor set just below the measured level; ratchet upward as tests are added.
      thresholds: { statements: 99, branches: 97, functions: 99, lines: 99 },
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
    __PDT_VERSION__: JSON.stringify(version),
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
    executableEntry(),
  ],
});
