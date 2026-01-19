import { useState, useCallback, useRef } from 'react';
import type { Message, MessageRole } from '@/components/chat/types';

export interface UseChatOptions {
  initialMessages?: Message[];
}

export interface UseChatReturn {
  messages: Message[];
  addMessage: (content: string, role: MessageRole) => Message;
  clearHistory: () => void;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>(options.initialMessages ?? []);
  const counterRef = useRef(0);

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

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, addMessage, clearHistory };
}
