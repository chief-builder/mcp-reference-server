import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface MessageInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  className?: string;
}

export function MessageInput({
  onSend,
  onCancel,
  disabled = false,
  isStreaming = false,
  placeholder = 'Type a message...',
  className,
}: MessageInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !disabled && !isStreaming) {
      onSend(trimmed);
      setValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCancel = () => {
    onCancel?.();
  };

  return (
    <form onSubmit={handleSubmit} className={cn('flex gap-2', className)}>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isStreaming}
        className="flex-1"
      />
      {isStreaming ? (
        <Button type="button" onClick={handleCancel} size="icon" variant="destructive">
          <Square className="h-4 w-4" />
          <span className="sr-only">Cancel</span>
        </Button>
      ) : (
        <Button type="submit" disabled={disabled || !value.trim()} size="icon">
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      )}
    </form>
  );
}
