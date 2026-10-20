import { defineConfig } from 'vitest/config';

/**
 * Tests of the built command line: each runs `node dist/index.js` in a sandbox, as a user would.
 * Build first (`pnpm build`); see tests/cli/global-setup.ts.
 */
export default defineConfig({
  test: {
    include: ['tests/cli/**/*.test.ts'],
    globalSetup: ['tests/cli/global-setup.ts'],
    // Each test starts node at least once, and init generates a whole module.
    testTimeout: 30_000,
  },
});
