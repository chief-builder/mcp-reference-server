import { useCallback, useRef, useState } from 'react';
import { streamingPost } from '@/lib/api';

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
}

export interface UseSSEReturn {
  sendMessage: (message: string, sessionId?: string) => Promise<void>;
  abort: () => void;
  isStreaming: boolean;
  error: string | null;
}

/**
 * Hook for handling SSE chat streaming
 *
 * Uses fetch with ReadableStream for SSE parsing since EventSource
 * doesn't support POST requests. Includes authentication support
 * with automatic token refresh on 401.
 */
export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const sendMessage = useCallback(
    async (message: string, sessionId?: string) => {
      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Track request ID to avoid race conditions with state updates
      requestIdRef.current += 1;
      const currentRequestId = requestIdRef.current;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsStreaming(true);
      setError(null);

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
        const message = err instanceof Error ? err.message : 'Unknown error';
        // Only update state if this is still the current request
        if (requestIdRef.current === currentRequestId) {
          setError(message);
          options.onError?.('connection_error', message);
        }
      } finally {
        // Only update state if this is still the current request
        if (requestIdRef.current === currentRequestId) {
          setIsStreaming(false);
          abortControllerRef.current = null;
        }
      }
    },
    [options]
  );

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return { sendMessage, abort, isStreaming, error };
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
