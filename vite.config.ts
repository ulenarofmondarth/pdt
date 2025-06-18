/// <reference types="vitest/config" />
import path from 'node:path';
import { defineConfig } from 'vite';
import { nodeExternals } from 'rollup-plugin-node-externals';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {},
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@util': path.resolve(import.meta.dirname, './src/util'),
      '@lib': path.resolve(import.meta.dirname, './src/lib'),
      '@schema': path.resolve(import.meta.dirname, './src/schema'),
    },
  },
  define: {
    __TEST_DATA__: JSON.stringify('./testdata'),
  },
  build: {
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
  plugins: [tsconfigPaths(), nodeExternals()],
});
