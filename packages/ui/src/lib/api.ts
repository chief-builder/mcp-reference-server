/**
 * API Client with Authentication
 *
 * Provides authenticated fetch wrapper for API requests:
 * - Automatically adds Authorization header with Bearer token
 * - Handles 401 responses with token refresh and retry
 * - Triggers logout on unrecoverable auth errors
 */

import { getToken, refreshToken, logout } from './auth';

// =============================================================================
// Types
// =============================================================================

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  /** Custom headers to merge with defaults */
  headers?: Record<string, string>;
  /** Skip authentication (for public endpoints) */
  skipAuth?: boolean;
  /** Skip 401 retry (to prevent infinite loops) */
  skipRetry?: boolean;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  ok: boolean;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  retryAfter?: number;
}

// =============================================================================
// Event System for Auth State
// =============================================================================

type AuthEventHandler = () => void;

const authEventHandlers: Set<AuthEventHandler> = new Set();

/**
 * Subscribe to auth state changes (e.g., forced logout)
 */
export function onAuthChange(handler: AuthEventHandler): () => void {
  authEventHandlers.add(handler);
  return () => {
    authEventHandlers.delete(handler);
  };
}

/**
 * Notify subscribers of auth state change
 */
function notifyAuthChange(): void {
  authEventHandlers.forEach((handler) => handler());
}

// =============================================================================
// API Client
// =============================================================================

/**
 * Make an authenticated API request
 *
 * @param url - API endpoint URL (relative to origin, e.g., '/api/chat')
 * @param options - Request options
 * @returns Response data
 * @throws ApiError on failure
 */
export async function apiRequest<T = unknown>(
  url: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  const { headers: customHeaders, skipAuth, skipRetry, ...fetchOptions } = options;

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  // Add auth header if authenticated and not skipping
  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    // Handle 401 Unauthorized
    if (response.status === 401 && !skipAuth && !skipRetry) {
      // Attempt token refresh
      const refreshed = await refreshToken();
      if (refreshed) {
        // Retry with new token
        return apiRequest(url, { ...options, skipRetry: true });
      }

      // Refresh failed - force logout
      logout();
      notifyAuthChange();

      throw createApiError('Session expired. Please log in again.', 401, 'session_expired');
    }

    // Handle 429 Rate Limit
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
      throw createApiError(
        `Rate limit exceeded. Please wait ${retryAfter} seconds.`,
        429,
        'rate_limit_exceeded',
        retryAfter
      );
    }

    // Handle 500 Internal Server Error
    if (response.status >= 500) {
      throw createApiError(
        'Something went wrong. Please try again.',
        response.status,
        'server_error'
      );
    }

    // Parse response
    const contentType = response.headers.get('content-type');
    let data: T;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = (await response.text()) as unknown as T;
    }

    if (!response.ok) {
      const errorMessage =
        typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error: unknown }).error)
          : typeof data === 'object' && data !== null && 'message' in data
            ? String((data as { message: unknown }).message)
            : `Request failed with status ${response.status}`;

      throw createApiError(errorMessage, response.status);
    }

    return {
      data,
      status: response.status,
      ok: true,
    };
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Network error';
    throw createApiError(message);
  }
}

/**
 * Create an API error
 */
function createApiError(
  message: string,
  status?: number,
  code?: string,
  retryAfter?: number
): ApiError {
  const error: ApiError = { message };
  if (status !== undefined) {
    error.status = status;
  }
  if (code !== undefined) {
    error.code = code;
  }
  if (retryAfter !== undefined) {
    error.retryAfter = retryAfter;
  }
  return error;
}

/**
 * Check if an error is an API error
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  );
}

// =============================================================================
// Convenience Methods
// =============================================================================

/**
 * GET request
 */
export async function get<T = unknown>(
  url: string,
  options?: Omit<ApiRequestOptions, 'method' | 'body'>
): Promise<ApiResponse<T>> {
  return apiRequest<T>(url, { ...options, method: 'GET' });
}

/**
 * POST request
 */
export async function post<T = unknown>(
  url: string,
  body?: unknown,
  options?: Omit<ApiRequestOptions, 'method' | 'body'>
): Promise<ApiResponse<T>> {
  return apiRequest<T>(url, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request
 */
export async function put<T = unknown>(
  url: string,
  body?: unknown,
  options?: Omit<ApiRequestOptions, 'method' | 'body'>
): Promise<ApiResponse<T>> {
  return apiRequest<T>(url, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request
 */
export async function del<T = unknown>(
  url: string,
  options?: Omit<ApiRequestOptions, 'method'>
): Promise<ApiResponse<T>> {
  return apiRequest<T>(url, { ...options, method: 'DELETE' });
}

// =============================================================================
// Streaming Support for Chat
// =============================================================================

export interface StreamingRequestOptions extends Omit<ApiRequestOptions, 'method'> {
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Make a streaming POST request (for SSE endpoints like /api/chat)
 *
 * Returns the raw Response for streaming - caller handles the stream
 */
export async function streamingPost(
  url: string,
  body: unknown,
  options: StreamingRequestOptions = {}
): Promise<Response> {
  const { headers: customHeaders, skipAuth, signal } = options;

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  // Add auth header if authenticated
  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  // Handle 401 with refresh and retry
  if (response.status === 401 && !skipAuth) {
    const refreshed = await refreshToken();
    if (refreshed) {
      // Retry with new token
      const newToken = getToken();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
      }
      return fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    }

    // Refresh failed - trigger logout
    logout();
    notifyAuthChange();
    throw createApiError('Session expired. Please log in again.', 401, 'session_expired');
  }

  return response;
}
