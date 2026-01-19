/**
 * ToolCard Component
 *
 * Displays a single tool with:
 * - Tool name
 * - Tool description
 * - Parameter schema
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Tool, ToolParameter } from '@/hooks/useTools';

// =============================================================================
// Types
// =============================================================================

export interface ToolCardProps {
  tool: Tool;
}

// =============================================================================
// Sub-components
// =============================================================================

function ParameterItem({ param }: { param: ToolParameter }) {
  return (
    <li className="text-sm">
      <span className="font-medium">{param.name}</span>
      {!param.required && <span className="text-muted-foreground">?</span>}
      <span className="text-muted-foreground">: {param.type}</span>
      {param.description && (
        <span className="ml-1 text-xs text-muted-foreground">- {param.description}</span>
      )}
    </li>
  );
}

// =============================================================================
// Component
// =============================================================================

export function ToolCard({ tool }: ToolCardProps) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{tool.name}</CardTitle>
        <CardDescription className="text-sm">{tool.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {tool.parameters.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Parameters:</p>
            <ul className="list-inside list-disc space-y-1">
              {tool.parameters.map((param) => (
                <ParameterItem key={param.name} param={param} />
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No parameters</p>
        )}
      </CardContent>
    </Card>
  );
}
