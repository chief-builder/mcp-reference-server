/**
 * Shared test port allocation helper
 *
 * Provides a centralized port counter to prevent port collisions across test files.
 * Since Vitest runs tests in parallel across different workers, each worker
 * gets a random base offset to prevent collisions.
 */

// Generate a random base port for this worker to avoid collisions
// Range: 20000-50000 to stay well clear of common ports
const workerBasePort = 20000 + Math.floor(Math.random() * 30000);
let portOffset = 0;

/**
 * Get a unique port for testing.
 * Ports are allocated from a random base per worker, then sequentially.
 * This prevents port collisions when tests run in parallel.
 *
 * @returns A unique port number for testing
 */
export function getTestPort(): number {
  const port = workerBasePort + portOffset;
  portOffset++;
  return port;
}

/**
 * Reset the port offset (useful for test isolation in specific scenarios).
 * Note: This only resets the offset, not the worker base port.
 *
 * @param offset - The offset to reset to (default 0)
 */
export function resetPortOffset(offset: number = 0): void {
  portOffset = offset;
}

/**
 * Get the current port that would be returned by getTestPort() without incrementing.
 * Useful for debugging port allocation issues.
 *
 * @returns The next port that would be returned
 */
export function peekNextPort(): number {
  return workerBasePort + portOffset;
}

/**
 * Get info about the current worker's port allocation.
 * Useful for debugging.
 *
 * @returns Object with base port and current offset
 */
export function getPortInfo(): { basePort: number; offset: number; nextPort: number } {
  return {
    basePort: workerBasePort,
    offset: portOffset,
    nextPort: workerBasePort + portOffset,
  };
}
