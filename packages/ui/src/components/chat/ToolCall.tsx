import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ToolCallData } from './types';

export interface ToolCallProps {
  toolCall: ToolCallData;
  className?: string;
}

export function ToolCall({ toolCall, className }: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);
  const isPending = toolCall.status === 'pending';

  return (
    <Card className={cn('mt-2', className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors rounded-t-lg"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Tool: {toolCall.name}</span>
        {isPending && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
      </button>
      {expanded && (
        <CardContent className="pt-0 pb-3 px-3">
          <div className="space-y-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Input</div>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Output</div>
              {isPending ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for result...
                </div>
              ) : (
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {typeof toolCall.result === 'string'
                    ? toolCall.result
                    : JSON.stringify(toolCall.result, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
