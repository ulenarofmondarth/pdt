import { defineConfig } from 'vitest/config';

/**
 * The live checks: against the real services, so run by hand (`pnpm check:live`), never in CI.
 */
export default defineConfig({
  test: {
    include: ['tests-live/**/*.live.test.ts'],
    testTimeout: 120_000,
  },
});
