import { cn } from '@/lib/utils';
import type { Message } from './types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ToolsPanel } from '@/components/tools';
import { Button } from '@/components/ui/button';

// =============================================================================
// Prompt Suggestions
// =============================================================================

const PROMPT_SUGGESTIONS = [
  {
    label: 'Get started',
    prompt: 'What can you help me with?',
  },
  {
    label: 'List tools',
    prompt: 'What tools do you have available?',
  },
  {
    label: 'Run a command',
    prompt: 'Can you help me run a shell command?',
  },
  {
    label: 'File operations',
    prompt: 'Can you help me with file operations?',
  },
];

// =============================================================================
// Empty State Component
// =============================================================================

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

function EmptyState({ onSelectPrompt }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4 sm:p-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
          Welcome to MCP Agent
        </h2>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Start a conversation or try one of the suggestions below
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        {PROMPT_SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion.label}
            variant="outline"
            className="h-auto justify-start whitespace-normal px-3 py-2 text-left text-sm sm:px-4 sm:py-3"
            onClick={() => onSelectPrompt(suggestion.prompt)}
          >
            <div>
              <div className="font-medium">{suggestion.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {suggestion.prompt}
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// ChatView Component
// =============================================================================

export interface ChatViewProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  streamingMessageId?: string | null;
  className?: string;
}

export function ChatView({
  messages,
  onSendMessage,
  onCancel,
  disabled = false,
  isLoading = false,
  isStreaming = false,
  streamingMessageId,
  className,
}: ChatViewProps) {
  const isEmpty = messages.length === 0;

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="hidden border-b sm:block">
        <ToolsPanel />
      </div>
      {isEmpty ? (
        <EmptyState onSelectPrompt={onSendMessage} />
      ) : (
        <MessageList
          messages={messages}
          streamingMessageId={streamingMessageId}
          className="flex-1 p-2 sm:p-4"
        />
      )}
      <div className="border-t p-2 sm:p-4">
        <MessageInput
          onSend={onSendMessage}
          onCancel={onCancel}
          disabled={disabled}
          isLoading={isLoading}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
