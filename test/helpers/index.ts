/**
 * Shared Test Helpers
 *
 * Common test utilities used across unit and integration tests.
 * Centralizes patterns for server creation, condition waiting, and mocking.
 */

import { HttpTransport } from '../../src/transport/http.js';
import { PROTOCOL_VERSION } from '../../src/protocol/lifecycle.js';

// Re-export port helpers
export {
  getTestPort,
  resetPortOffset,
  peekNextPort,
  getPortInfo,
} from './ports.js';

// =============================================================================
// Types
// =============================================================================

export interface TestServer {
  transport: HttpTransport;
  port: number;
  baseUrl: string;
}

export interface TestServerOptions {
  allowedOrigins?: string[];
  statelessMode?: boolean;
  sessionTtlMs?: number;
  sseKeepAliveInterval?: number;
  sseBufferSize?: number;
}

export interface MockFetchResponse {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** If provided, fetch will throw this error instead of returning a response */
  error?: Error;
  /** Delay in milliseconds before returning the response */
  delay?: number;
}

export interface MockFetchCall {
  url: string;
  options: RequestInit;
  timestamp: number;
}

export interface MockFetchInstance {
  /** The mock fetch function to assign to global.fetch */
  fetch: typeof global.fetch;
  /** Record of all calls made to the mock */
  calls: MockFetchCall[];
  /** Add a response for a URL pattern (string or regex) */
  addResponse: (urlPattern: string | RegExp, response: MockFetchResponse) => void;
  /** Set a default response for unmatched URLs */
  setDefaultResponse: (response: MockFetchResponse) => void;
  /** Reset all responses and call history */
  reset: () => void;
  /** Restore the original fetch */
  restore: () => void;
}

// =============================================================================
// Server Helpers
// =============================================================================

/**
 * Creates a test HTTP server with the specified options.
 *
 * The server is started and ready to accept connections when the promise resolves.
 * Always call `await server.transport.close()` in afterEach to clean up.
 *
 * @param options - Server configuration options
 * @returns A started test server with transport, port, and baseUrl
 *
 * @example
 * ```typescript
 * let server: TestServer;
 *
 * beforeEach(async () => {
 *   server = await createTestServer({ allowedOrigins: ['*'] });
 *   server.transport.setMessageHandler(async (msg) => {
 *     // Handle messages
 *     return null;
 *   });
 * });
 *
 * afterEach(async () => {
 *   await server.transport.close().catch(() => {});
 * });
 * ```
 */
export async function createTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  // Import dynamically to avoid circular dependencies
  const { getTestPort } = await import('./ports.js');

  const port = getTestPort();
  const transport = new HttpTransport({
    port,
    allowedOrigins: options.allowedOrigins ?? ['*'],
    statelessMode: options.statelessMode ?? false,
    sessionTtlMs: options.sessionTtlMs,
    sseKeepAliveInterval: options.sseKeepAliveInterval ?? 0,
    sseBufferSize: options.sseBufferSize ?? 10,
  });

  await transport.start();

  return {
    transport,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

/**
 * Sends a JSON-RPC request to a test server.
 *
 * @param server - The test server to send to
 * @param body - The JSON-RPC message body
 * @param headers - Additional headers to include
 * @returns The fetch Response object
 *
 * @example
 * ```typescript
 * const response = await sendRequest(
 *   server,
 *   createRequest(1, 'tools/list'),
 *   { 'MCP-Session-Id': sessionId }
 * );
 * expect(response.status).toBe(200);
 * ```
 */
export async function sendRequest(
  server: TestServer,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    ...headers,
  };

  return fetch(`${server.baseUrl}/mcp`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  });
}

// =============================================================================
// Condition Helpers
// =============================================================================

/**
 * Waits for a condition to become true, polling at regular intervals.
 *
 * This is useful for waiting on asynchronous state changes that don't
 * have a direct promise to await.
 *
 * @param condition - A function that returns true when the condition is met
 * @param options - Configuration options
 * @returns A promise that resolves when the condition is true
 * @throws Error if the condition is not met within the timeout
 *
 * @example
 * ```typescript
 * // Wait for session to be registered
 * await waitForCondition(() => sseManager.hasStream(sessionId));
 *
 * // Wait with custom timeout
 * await waitForCondition(
 *   () => server.getConnectionCount() > 0,
 *   { timeout: 5000, interval: 50 }
 * );
 * ```
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: {
    /** Maximum time to wait in milliseconds (default: 1000) */
    timeout?: number;
    /** Polling interval in milliseconds (default: 10) */
    interval?: number;
    /** Error message if condition is not met */
    message?: string;
  } = {}
): Promise<void> {
  const { timeout = 1000, interval = 10, message = 'Condition not met within timeout' } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(message);
}

/**
 * Creates a deferred promise that can be resolved or rejected externally.
 *
 * Useful for synchronizing test code with async operations.
 *
 * @returns An object with the promise and resolve/reject functions
 *
 * @example
 * ```typescript
 * const { promise, resolve } = createDeferred<string>();
 *
 * // In async code
 * server.onMessage = (msg) => resolve(msg);
 *
 * // In test
 * const message = await promise;
 * expect(message).toBe('expected');
 * ```
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

// =============================================================================
// Mock Fetch Helpers
// =============================================================================

/**
 * Creates a mock fetch implementation with predefined responses.
 *
 * Supports:
 * - URL pattern matching (string prefix or regex)
 * - Response delays for timeout testing
 * - Error throwing for network failure simulation
 * - Call recording for verification
 *
 * @param responses - Initial URL to response mappings
 * @returns A mock fetch instance
 *
 * @example
 * ```typescript
 * const mock = mockFetch({
 *   'https://api.example.com/token': {
 *     ok: true,
 *     status: 200,
 *     body: { access_token: 'test-token' },
 *   },
 * });
 *
 * global.fetch = mock.fetch;
 *
 * // For network errors
 * mock.addResponse('/token', {
 *   error: new TypeError('Failed to fetch'),
 * });
 *
 * // For timeouts
 * mock.addResponse('/slow', {
 *   delay: 5000,
 *   body: { result: 'slow' },
 * });
 *
 * afterEach(() => mock.restore());
 * ```
 */
export function mockFetch(
  responses: Record<string, MockFetchResponse> = {}
): MockFetchInstance {
  const originalFetch = global.fetch;
  const calls: MockFetchCall[] = [];
  const responseMap = new Map<string | RegExp, MockFetchResponse>();
  let defaultResponse: MockFetchResponse = {
    ok: false,
    status: 404,
    body: { error: 'not_found', error_description: 'No mock response configured' },
  };

  // Initialize with provided responses
  for (const [url, response] of Object.entries(responses)) {
    responseMap.set(url, response);
  }

  const findResponse = (url: string): MockFetchResponse => {
    // Check exact matches first
    if (responseMap.has(url)) {
      return responseMap.get(url)!;
    }

    // Check pattern matches
    for (const [pattern, response] of responseMap) {
      if (typeof pattern === 'string') {
        if (url.includes(pattern)) {
          return response;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(url)) {
          return response;
        }
      }
    }

    return defaultResponse;
  };

  const mockFn = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const options = init ?? {};

    calls.push({
      url,
      options,
      timestamp: Date.now(),
    });

    const mockResponse = findResponse(url);

    // Handle delay
    if (mockResponse.delay) {
      await new Promise((resolve) => setTimeout(resolve, mockResponse.delay));
    }

    // Handle error
    if (mockResponse.error) {
      throw mockResponse.error;
    }

    // Build response
    const status = mockResponse.status ?? (mockResponse.ok !== false ? 200 : 500);
    const ok = mockResponse.ok ?? (status >= 200 && status < 300);
    const headers = new Headers(mockResponse.headers ?? {});

    // Add content-type if not set and body is object
    if (mockResponse.body && typeof mockResponse.body === 'object' && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    return {
      ok,
      status,
      statusText: mockResponse.statusText ?? (ok ? 'OK' : 'Error'),
      headers,
      url,
      redirected: false,
      type: 'basic' as ResponseType,
      body: null,
      bodyUsed: false,
      json: async () => mockResponse.body,
      text: async () =>
        typeof mockResponse.body === 'string'
          ? mockResponse.body
          : JSON.stringify(mockResponse.body),
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob(),
      formData: async () => new FormData(),
      clone: function () {
        return this;
      },
    } as Response;
  };

  const instance: MockFetchInstance = {
    fetch: mockFn as typeof global.fetch,
    calls,
    addResponse: (urlPattern: string | RegExp, response: MockFetchResponse) => {
      responseMap.set(urlPattern, response);
    },
    setDefaultResponse: (response: MockFetchResponse) => {
      defaultResponse = response;
    },
    reset: () => {
      calls.length = 0;
      responseMap.clear();
    },
    restore: () => {
      global.fetch = originalFetch;
    },
  };

  return instance;
}

// =============================================================================
// Network Error Helpers
// =============================================================================

/**
 * Creates common network error types for testing error handling.
 */
export const NetworkErrors = {
  /**
   * Simulates a network timeout (AbortError)
   */
  timeout: (message = 'The operation was aborted due to timeout'): Error => {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
  },

  /**
   * Simulates a connection refused error
   */
  connectionRefused: (message = 'Connection refused'): TypeError => {
    return new TypeError(`fetch failed: ${message}`);
  },

  /**
   * Simulates a DNS resolution failure
   */
  dnsResolutionFailed: (hostname = 'unknown.host'): TypeError => {
    return new TypeError(`getaddrinfo ENOTFOUND ${hostname}`);
  },

  /**
   * Simulates a connection reset/dropped
   */
  connectionReset: (message = 'Connection reset by peer'): Error => {
    const error = new Error(message);
    error.name = 'ConnectionResetError';
    return error;
  },

  /**
   * Simulates a generic network failure
   */
  networkError: (message = 'Network request failed'): TypeError => {
    return new TypeError(message);
  },

  /**
   * Simulates a TLS/SSL error
   */
  sslError: (message = 'SSL certificate problem'): Error => {
    const error = new Error(message);
    error.name = 'SSLError';
    return error;
  },
};

// =============================================================================
// Time Helpers
// =============================================================================

/**
 * Delays execution for a specified number of milliseconds.
 *
 * @param ms - Milliseconds to delay
 * @returns A promise that resolves after the delay
 *
 * @example
 * ```typescript
 * await delay(100);
 * ```
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// SSE Helpers
// =============================================================================

/**
 * Parses SSE events from response body text.
 *
 * @param text - Raw SSE stream text
 * @returns Array of parsed events
 *
 * @example
 * ```typescript
 * const events = parseSSEEvents(responseText);
 * expect(events[0].data).toContain('message');
 * ```
 */
export function parseSSEEvents(
  text: string
): Array<{ id?: string; event?: string; data?: string }> {
  const events: Array<{ id?: string; event?: string; data?: string }> = [];
  const lines = text.split('\n');
  let currentEvent: { id?: string; event?: string; data?: string } = {};

  for (const line of lines) {
    if (line.startsWith('id: ')) {
      currentEvent.id = line.substring(4);
    } else if (line.startsWith('event: ')) {
      currentEvent.event = line.substring(7);
    } else if (line.startsWith('data: ')) {
      currentEvent.data = (currentEvent.data ?? '') + line.substring(6);
    } else if (line === '' && Object.keys(currentEvent).length > 0) {
      events.push(currentEvent);
      currentEvent = {};
    }
  }

  return events;
}
