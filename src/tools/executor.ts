/**
 * Tool execution with validation
 */

import type { ToolDefinition } from './registry.js';

export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  durationMs: number;
}

export interface ToolExecutorOptions {
  timeoutMs?: number;
  validateInput?: boolean;
}

export class ToolExecutor {
  constructor(private readonly options: ToolExecutorOptions = {}) {}

  async execute(
    tool: ToolDefinition,
    input: unknown
  ): Promise<ToolExecutionResult> {
    const startTime = performance.now();

    try {
      // Validate input if enabled
      if (this.options.validateInput !== false) {
        const parseResult = tool.inputSchema.safeParse(input);
        if (!parseResult.success) {
          return {
            success: false,
            error: {
              code: 'INVALID_INPUT',
              message: 'Input validation failed',
              details: parseResult.error.issues,
            },
            durationMs: performance.now() - startTime,
          };
        }
        input = parseResult.data;
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(tool, input);

      return {
        success: true,
        result,
        durationMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        durationMs: performance.now() - startTime,
      };
    }
  }

  private async executeWithTimeout(
    tool: ToolDefinition,
    input: unknown
  ): Promise<unknown> {
    const timeoutMs = this.options.timeoutMs ?? 30000;

    return Promise.race([
      tool.handler(input),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)
      ),
    ]);
  }
}
