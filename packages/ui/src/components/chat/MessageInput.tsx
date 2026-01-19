import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// =============================================================================
// Spinner Component
// =============================================================================

function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} />;
}

// =============================================================================
// MessageInput Component
// =============================================================================

export interface MessageInputProps {
  onSend: (message: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function MessageInput({
  onSend,
  onCancel,
  disabled = false,
  isStreaming = false,
  isLoading = false,
  placeholder = 'Type a message...',
  className,
}: MessageInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !disabled && !isStreaming && !isLoading) {
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

  // Show loading or streaming state
  const showCancelButton = isStreaming;
  const showLoadingSpinner = isLoading && !isStreaming;
  const inputDisabled = disabled || isStreaming || isLoading;

  return (
    <form onSubmit={handleSubmit} className={cn('flex gap-2', className)}>
      <div className="relative flex-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={inputDisabled}
          className="w-full pr-10"
        />
        {showLoadingSpinner && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      {showCancelButton ? (
        <Button type="button" onClick={handleCancel} size="icon" variant="destructive">
          <Square className="h-4 w-4" />
          <span className="sr-only">Cancel</span>
        </Button>
      ) : (
        <Button type="submit" disabled={inputDisabled || !value.trim()} size="icon">
          {showLoadingSpinner ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="sr-only">Send message</span>
        </Button>
      )}
    </form>
  );
}
