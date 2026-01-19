import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/utils';
import type { Message } from './types';

export interface AssistantMessageProps {
  message: Message;
  className?: string;
}

export function AssistantMessage({ message, className }: AssistantMessageProps) {
  return (
    <div className={cn('flex justify-start', className)}>
      <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown rehypePlugins={[rehypeSanitize, rehypeHighlight]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
