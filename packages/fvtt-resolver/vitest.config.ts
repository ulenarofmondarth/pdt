import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.d.ts'],
      // lcov feeds Codecov, with paths from the repository root; json-summary feeds the CI job summary.
      reporter: ['text', 'html', ['lcov', { projectRoot: '../..' }], 'json-summary'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
