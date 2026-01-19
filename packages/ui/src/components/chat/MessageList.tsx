import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { Message } from './types';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';

export interface MessageListProps {
  messages: Message[];
  className?: string;
}

export function MessageList({ messages, className }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={cn('flex flex-col gap-4 overflow-y-auto', className)}>
      {messages.map((message) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} message={message} />
        ) : (
          <AssistantMessage key={message.id} message={message} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  );
}
