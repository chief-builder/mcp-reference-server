/**
 * Vitest Global Test Setup
 *
 * Configures the test environment before tests run.
 * Suppresses console output during tests to reduce noise.
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

beforeAll(() => {
  // Suppress console output during tests to reduce noise
  // This prevents [ShutdownManager] and other internal logs from cluttering test output
  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();
  console.info = vi.fn();
  console.debug = vi.fn();
});

afterAll(() => {
  // Restore original console methods after all tests complete
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
});
