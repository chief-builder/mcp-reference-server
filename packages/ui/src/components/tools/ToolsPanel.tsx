/**
 * ToolsPanel Component
 *
 * Displays the list of available MCP tools:
 * - Can be toggled visible/hidden
 * - Shows loading and error states
 * - Lists tools using ToolCard components
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ToolCard } from './ToolCard';
import { useTools } from '@/hooks/useTools';

// =============================================================================
// Types
// =============================================================================

export interface ToolsPanelProps {
  /** Additional CSS classes */
  className?: string;
  /** Initial visibility state */
  defaultVisible?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function ToolsPanel({ className, defaultVisible = false }: ToolsPanelProps) {
  const [isVisible, setIsVisible] = useState(defaultVisible);
  const { tools, isLoading, error, refresh } = useTools();

  const toggleVisibility = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Toggle Button */}
      <Button variant="outline" size="sm" onClick={toggleVisibility} className="mb-2 self-end">
        {isVisible ? 'Hide Tools' : 'Show Tools'}
      </Button>

      {/* Panel Content */}
      {isVisible && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Available Tools</h3>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
              {isLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>

          {/* Error State */}
          {error && (
            <div className="mb-4 rounded bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Loading State */}
          {isLoading && tools.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="ml-2 text-sm text-muted-foreground">Loading tools...</span>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && tools.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No tools available</p>
          )}

          {/* Tools List */}
          {tools.length > 0 && (
            <div className="space-y-3">
              {tools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
