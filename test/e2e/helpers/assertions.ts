/**
 * E2E Test Assertions and Utilities
 *
 * Provides helpers for waiting on server readiness and other
 * common assertion patterns in E2E tests.
 */

/**
 * Wait for a server to be ready at the given port.
 * Polls the health endpoint until it responds or times out.
 *
 * @param port - Port to check
 * @param timeout - Timeout in milliseconds (default: 10000)
 * @param host - Host to connect to (default: 127.0.0.1)
 * @returns Promise that resolves when server is ready
 * @throws Error if server doesn't respond within timeout
 */
export async function waitForServerReady(
  port: number,
  timeout: number = 10000,
  host: string = '127.0.0.1'
): Promise<void> {
  const url = `http://${host}:${port}/mcp`;
  const startTime = Date.now();
  const pollInterval = 100;

  while (Date.now() - startTime < timeout) {
    try {
      // Send a minimal request to check if server is responding
      const response = await fetch(url, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(1000),
      });

      // Server is ready if it responds (even with error status)
      if (response.status !== 0) {
        return;
      }
    } catch {
      // Connection refused or other error - server not ready yet
    }

    await sleep(pollInterval);
  }

  throw new Error(`Server at ${url} not ready after ${timeout}ms`);
}

/**
 * Wait for a condition to become true.
 *
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds
 * @param pollInterval - How often to check condition in milliseconds
 * @param message - Error message if condition not met
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  pollInterval: number = 100,
  message: string = 'Condition not met within timeout'
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(pollInterval);
  }

  throw new Error(message);
}

/**
 * Retry an async operation with exponential backoff.
 *
 * @param operation - Async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param baseDelayMs - Initial delay between attempts (default: 100)
 * @returns Result of successful operation
 * @throws Last error if all attempts fail
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Retry failed');
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique port number for E2E tests.
 * Uses range 50001-65535 to avoid overlap with integration tests (20000-50000).
 */
export function getEphemeralPort(): number {
  // E2E port range: 50001-65535 (integration tests use 20000-50000)
  const min = 50001;
  const max = 65535;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
