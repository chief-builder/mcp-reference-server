import { cn } from '@/lib/utils';
import type { Message } from './types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ToolsPanel } from '@/components/tools';

export interface ChatViewProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  streamingMessageId?: string | null;
  className?: string;
}

export function ChatView({
  messages,
  onSendMessage,
  onCancel,
  disabled = false,
  isStreaming = false,
  streamingMessageId,
  className,
}: ChatViewProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="border-b">
        <ToolsPanel />
      </div>
      <MessageList
        messages={messages}
        streamingMessageId={streamingMessageId}
        className="flex-1 p-4"
      />
      <div className="border-t p-4">
        <MessageInput
          onSend={onSendMessage}
          onCancel={onCancel}
          disabled={disabled}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
