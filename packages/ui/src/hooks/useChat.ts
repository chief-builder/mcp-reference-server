import { useState, useCallback, useRef, useMemo } from 'react';
import type { Message, MessageRole } from '@/components/chat/types';
import { useSSE } from './useSSE';

export interface UseChatOptions {
  initialMessages?: Message[];
  sessionId?: string;
  onError?: (message: string) => void;
}

export interface UseChatReturn {
  messages: Message[];
  sendMessage: (content: string) => void;
  clearHistory: () => void;
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

  const handleToolCall = useCallback(
    (name: string, args: Record<string, unknown>) => {
      // Append tool call info to the streaming message, including args for debugging
      if (streamingMessageId) {
        const argsStr = Object.keys(args).length > 0
          ? `\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n`
          : '';
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageId
              ? {
                  ...msg,
                  content: msg.content + `\n\n*Calling tool: ${name}*${argsStr}`,
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
      // For now, append tool result info to the streaming message
      if (streamingMessageId) {
        const resultStr =
          typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageId
              ? {
                  ...msg,
                  content: msg.content + `\n\n*Result from ${name}:*\n\`\`\`\n${resultStr}\n\`\`\`\n\n`,
                }
              : msg
          )
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

  const { sendMessage: sendSSEMessage, isStreaming, error } = useSSE(sseOptions);

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

  return {
    messages,
    sendMessage,
    clearHistory,
    isLoading,
    isStreaming,
    error,
    streamingMessageId,
  };
}
