import { useState, useCallback, useRef, useMemo } from 'react';
import type { Message, MessageRole, ToolCallData } from '@/components/chat/types';
import { useSSE } from './useSSE';
import { post } from '@/lib/api';

export interface UseChatOptions {
  initialMessages?: Message[];
  sessionId?: string;
  onError?: (message: string) => void;
}

export interface UseChatReturn {
  messages: Message[];
  sendMessage: (content: string) => void;
  clearHistory: () => void;
  cancel: () => void;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  streamingMessageId: string | null;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>(options.initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const counterRef = useRef(0);
  const sessionIdRef = useRef(options.sessionId || `session-${Date.now()}`);

  const addMessage = useCallback((content: string, role: MessageRole): Message => {
    counterRef.current += 1;
    const message: Message = {
      id: `msg-${Date.now()}-${counterRef.current}`,
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  const handleToken = useCallback(
    (content: string) => {
      if (streamingMessageId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageId
              ? { ...msg, content: msg.content + content }
              : msg
          )
        );
      }
    },
    [streamingMessageId]
  );

  const toolCallCounterRef = useRef(0);

  const handleToolCall = useCallback(
    (name: string, args: Record<string, unknown>) => {
      // Add a new tool call entry to the streaming message
      if (streamingMessageId) {
        toolCallCounterRef.current += 1;
        const toolCallId = `tool-${Date.now()}-${toolCallCounterRef.current}`;
        const newToolCall: ToolCallData = {
          id: toolCallId,
          name,
          args,
          status: 'pending',
        };
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageId
              ? {
                  ...msg,
                  toolCalls: [...(msg.toolCalls || []), newToolCall],
                }
              : msg
          )
        );
      }
    },
    [streamingMessageId]
  );

  const handleToolResult = useCallback(
    (name: string, result: unknown) => {
      // Update the first pending tool call with the matching name
      if (streamingMessageId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== streamingMessageId) return msg;
            const toolCalls = msg.toolCalls || [];
            let updated = false;
            const updatedToolCalls = toolCalls.map((tc) => {
              if (!updated && tc.name === name && tc.status === 'pending') {
                updated = true;
                return { ...tc, result, status: 'complete' as const };
              }
              return tc;
            });
            return { ...msg, toolCalls: updatedToolCalls };
          })
        );
      }
    },
    [streamingMessageId]
  );

  const handleDone = useCallback(() => {
    setIsLoading(false);
    setStreamingMessageId(null);
  }, []);

  const handleError = useCallback(
    (_code: string, message: string) => {
      setIsLoading(false);
      setStreamingMessageId(null);
      options.onError?.(message);
    },
    [options]
  );

  // Memoize SSE options to prevent infinite re-renders
  const sseOptions = useMemo(
    () => ({
      onToken: handleToken,
      onToolCall: handleToolCall,
      onToolResult: handleToolResult,
      onDone: handleDone,
      onError: handleError,
    }),
    [handleToken, handleToolCall, handleToolResult, handleDone, handleError]
  );

  const { sendMessage: sendSSEMessage, abort, isStreaming, error } = useSSE(sseOptions);

  const sendMessage = useCallback(
    (content: string) => {
      if (isLoading || isStreaming) return;

      // Add user message
      addMessage(content, 'user');

      // Create placeholder assistant message for streaming
      counterRef.current += 1;
      const assistantMsgId = `msg-${Date.now()}-${counterRef.current}`;
      const assistantMessage: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingMessageId(assistantMsgId);
      setIsLoading(true);

      // Send message via SSE
      sendSSEMessage(content, sessionIdRef.current);
    },
    [isLoading, isStreaming, addMessage, sendSSEMessage]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    setStreamingMessageId(null);
    setIsLoading(false);
  }, []);

  const cancel = useCallback(async () => {
    // Abort the client-side fetch
    abort();
    setIsLoading(false);
    setStreamingMessageId(null);

    // Call server-side cancel endpoint (authenticated)
    try {
      await post('/api/cancel', { sessionId: sessionIdRef.current });
    } catch {
      // Ignore cancel errors - best effort
    }
  }, [abort]);

  return {
    messages,
    sendMessage,
    clearHistory,
    cancel,
    isLoading,
    isStreaming,
    error,
    streamingMessageId,
  };
}
