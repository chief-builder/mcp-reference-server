import { useCallback, useRef, useState } from 'react';
import { streamingPost } from '@/lib/api';

// =============================================================================
// Constants
// =============================================================================

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

// =============================================================================
// Types
// =============================================================================

export interface SSETokenEvent {
  type: 'token';
  content: string;
}

export interface SSEToolCallEvent {
  type: 'tool_call';
  name: string;
  args: Record<string, unknown>;
}

export interface SSEToolResultEvent {
  type: 'tool_result';
  name: string;
  result: unknown;
}

export interface SSEDoneEvent {
  type: 'done';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SSEErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export type SSEEvent =
  | SSETokenEvent
  | SSEToolCallEvent
  | SSEToolResultEvent
  | SSEDoneEvent
  | SSEErrorEvent;

export interface UseSSEOptions {
  onToken?: (content: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: unknown) => void;
  onDone?: (usage: SSEDoneEvent['usage']) => void;
  onError?: (code: string, message: string) => void;
  onAuthError?: () => void;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface UseSSEReturn {
  sendMessage: (message: string, sessionId?: string) => Promise<void>;
  abort: () => void;
  isStreaming: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  retryCount: number;
}

/**
 * Calculate retry delay with exponential backoff
 */
function getRetryDelay(retryCount: number): number {
  const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
  return Math.min(delay, MAX_RETRY_DELAY);
}

/**
 * Check if an error is a network/connection error that should trigger retry
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('econnrefused')
    );
  }
  return false;
}

/**
 * Hook for handling SSE chat streaming
 *
 * Uses fetch with ReadableStream for SSE parsing since EventSource
 * doesn't support POST requests. Includes authentication support
 * with automatic token refresh on 401, and retry logic for network failures.
 */
export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');
  const [retryCount, setRetryCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const updateConnectionStatus = useCallback(
    (status: ConnectionStatus) => {
      setConnectionStatus(status);
      options.onConnectionStatusChange?.(status);
    },
    [options]
  );

  const sendMessage = useCallback(
    async (message: string, sessionId?: string, currentRetry = 0) => {
      // Abort any existing request (only on initial call, not retries)
      if (currentRetry === 0 && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Track request ID to avoid race conditions with state updates
      if (currentRetry === 0) {
        requestIdRef.current += 1;
      }
      const currentRequestId = requestIdRef.current;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsStreaming(true);
      setError(null);
      setRetryCount(currentRetry);

      if (currentRetry > 0) {
        updateConnectionStatus('reconnecting');
      }

      try {
        // Use the authenticated streaming POST helper
        const response = await streamingPost(
          '/api/chat',
          { message, sessionId },
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        // Connection successful
        updateConnectionStatus('connected');
        setRetryCount(0);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let currentEvent = '';
        let currentData = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Flush any remaining buffered event before exiting
            if (currentEvent && currentData) {
              try {
                const data = JSON.parse(currentData);
                handleEvent(currentEvent, data, options);
              } catch {
                console.error('Failed to parse final SSE data:', currentData);
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7);
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6);
            } else if (line === '' && currentEvent && currentData) {
              // End of event, process it
              try {
                const data = JSON.parse(currentData);
                handleEvent(currentEvent, data, options);
              } catch {
                console.error('Failed to parse SSE data:', currentData);
              }
              currentEvent = '';
              currentData = '';
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was aborted, not an error
          return;
        }

        const errorMessage = err instanceof Error ? err.message : 'Unknown error';

        // Check if we should retry for network errors
        if (isNetworkError(err) && currentRetry < MAX_RETRIES) {
          const nextRetry = currentRetry + 1;
          const delay = getRetryDelay(currentRetry);

          // Only update state if this is still the current request
          if (requestIdRef.current === currentRequestId) {
            setError(`Connection lost. Retrying... (${nextRetry}/${MAX_RETRIES})`);
            updateConnectionStatus('reconnecting');
          }

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Retry if not aborted and still current request
          if (requestIdRef.current === currentRequestId && abortControllerRef.current) {
            return sendMessage(message, sessionId, nextRetry);
          }
          return;
        }

        // Only update state if this is still the current request
        if (requestIdRef.current === currentRequestId) {
          setError(errorMessage);
          updateConnectionStatus('disconnected');
          options.onError?.('connection_error', errorMessage);
        }
      } finally {
        // Only update state if this is still the current request
        if (requestIdRef.current === currentRequestId) {
          setIsStreaming(false);
          abortControllerRef.current = null;
        }
      }
    },
    [options, updateConnectionStatus]
  );

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setRetryCount(0);
  }, []);

  return { sendMessage, abort, isStreaming, error, connectionStatus, retryCount };
}

function handleEvent(
  event: string,
  data: Record<string, unknown>,
  options: UseSSEOptions
): void {
  switch (event) {
    case 'token':
      options.onToken?.(data.content as string);
      break;
    case 'tool_call':
      options.onToolCall?.(
        data.name as string,
        data.args as Record<string, unknown>
      );
      break;
    case 'tool_result':
      options.onToolResult?.(data.name as string, data.result);
      break;
    case 'done':
      options.onDone?.(
        data.usage as {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        }
      );
      break;
    case 'error':
      options.onError?.(data.code as string, data.message as string);
      break;
  }
}
