import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/utils';
import type { Message } from './types';
import { ToolCall } from './ToolCall';

export interface AssistantMessageProps {
  message: Message;
  isStreaming?: boolean;
  className?: string;
}

export function AssistantMessage({ message, isStreaming = false, className }: AssistantMessageProps) {
  const content = message.content || '';
  const displayContent = isStreaming && content ? content + '\u2588' : content;
  const toolCalls = message.toolCalls || [];

  return (
    <div className={cn('flex justify-start', className)}>
      <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {displayContent ? (
            <ReactMarkdown rehypePlugins={[rehypeSanitize, rehypeHighlight]}>
              {displayContent}
            </ReactMarkdown>
          ) : isStreaming ? (
            <span className="animate-pulse">{'\u2588'}</span>
          ) : null}
        </div>
        {toolCalls.length > 0 && (
          <div className="mt-2 space-y-2">
            {toolCalls.map((toolCall) => (
              <ToolCall key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
