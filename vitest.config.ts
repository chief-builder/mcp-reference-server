import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Test file patterns
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'test/e2e/**'],

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporter configuration
    reporters: ['default'],

    // Global setup to suppress console output during tests
    setupFiles: ['./test/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/cli.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },

    // Pool configuration for parallel execution
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },

    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,
  },
});
