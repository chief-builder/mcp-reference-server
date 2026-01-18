import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for E2E tests.
 *
 * E2E tests spawn actual server processes and test real client/server
 * communication. They require longer timeouts and sequential execution.
 */
export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // E2E test file patterns
    include: ['test/e2e/**/*.e2e.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Longer timeouts for E2E tests (spawn processes, network I/O)
    testTimeout: 30000,
    hookTimeout: 30000,

    // Reporter configuration
    reporters: ['default'],

    // Sequential execution to avoid port conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,
  },
});
