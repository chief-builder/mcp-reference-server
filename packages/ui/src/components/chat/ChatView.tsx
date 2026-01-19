import { cn } from '@/lib/utils';
import type { Message } from './types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export interface ChatViewProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ChatView({ messages, onSendMessage, disabled = false, className }: ChatViewProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      <MessageList messages={messages} className="flex-1 p-4" />
      <div className="border-t p-4">
        <MessageInput onSend={onSendMessage} disabled={disabled} />
      </div>
    </div>
  );
}
