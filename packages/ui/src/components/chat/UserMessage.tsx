import { cn } from '@/lib/utils';
import type { Message } from './types';

export interface UserMessageProps {
  message: Message;
  className?: string;
}

export function UserMessage({ message, className }: UserMessageProps) {
  return (
    <div className={cn('flex justify-end', className)}>
      <div className="max-w-[80%] rounded-lg bg-primary/10 px-4 py-2">
        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
      </div>
    </div>
  );
}
