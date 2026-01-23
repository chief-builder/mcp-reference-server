/**
 * Slow Operation Tool
 *
 * A test utility tool that sleeps for a specified duration.
 * Used for E2E testing of timeout behavior.
 */

import { z } from 'zod';
import type { Tool, ToolRegistry, JsonSchema, ToolResult } from './registry.js';
import { createToolSuccessResult, createToolErrorResult } from '../protocol/errors.js';

// =============================================================================
// Constants
// =============================================================================

/** Maximum allowed sleep duration in milliseconds (5 minutes) */
const MAX_DURATION_MS = 300000;

/** Minimum allowed sleep duration in milliseconds */
const MIN_DURATION_MS = 0;

// =============================================================================
// Input Schema (Zod for internal validation)
// =============================================================================

export const SlowOperationInputSchema = z.object({
  duration_ms: z
    .number()
    .int('Duration must be an integer')
    .min(MIN_DURATION_MS, `Duration must be at least ${MIN_DURATION_MS}ms`)
    .max(MAX_DURATION_MS, `Duration must not exceed ${MAX_DURATION_MS}ms`),
});

export type SlowOperationInput = z.infer<typeof SlowOperationInputSchema>;

// =============================================================================
// JSON Schema (for MCP tool definition)
// =============================================================================

export const slowOperationInputJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    duration_ms: {
      type: 'integer',
      description: `Duration to sleep in milliseconds. Must be between ${MIN_DURATION_MS} and ${MAX_DURATION_MS}.`,
      minimum: MIN_DURATION_MS,
      maximum: MAX_DURATION_MS,
    },
  },
  required: ['duration_ms'],
  additionalProperties: false,
};

// =============================================================================
// Sleep Utility
// =============================================================================

/**
 * Sleep for the specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Tool Handler
// =============================================================================

/**
 * Execute a slow operation (sleep) and return a SEP-1303 compliant ToolResult.
 */
export async function slowOperationHandler(args: unknown): Promise<ToolResult> {
  // Validate input with Zod
  const parseResult = SlowOperationInputSchema.safeParse(args);
  if (!parseResult.success) {
    return createToolErrorResult(
      'Invalid input: ' + parseResult.error.errors.map((e) => e.message).join(', '),
      'slow_operation'
    );
  }

  const { duration_ms } = parseResult.data;
  const startTime = Date.now();

  // Sleep for the specified duration
  await sleep(duration_ms);

  const actualDuration = Date.now() - startTime;

  // Return successful result
  return createToolSuccessResult(
    JSON.stringify({
      requested_duration_ms: duration_ms,
      actual_duration_ms: actualDuration,
      message: `Slept for ${actualDuration}ms`,
    })
  );
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * Slow operation tool definition with SEP-1303 annotations.
 */
export const slowOperationTool: Tool = {
  name: 'slow_operation',
  title: 'Slow Operation',
  description:
    'Sleep for a specified duration. Used for testing timeout behavior in E2E tests.',
  inputSchema: slowOperationInputJsonSchema,
  annotations: {
    readOnlyHint: true, // Does not modify any state
    destructiveHint: false, // Cannot delete or modify data
    idempotentHint: true, // Same inputs always produce same behavior
    openWorldHint: false, // No external services or APIs
  },
  handler: slowOperationHandler,
};

// =============================================================================
// Registration Helper
// =============================================================================

/**
 * Register the slow operation tool with a ToolRegistry.
 *
 * @param registry - The ToolRegistry to register with
 */
export function registerSlowOperationTool(registry: ToolRegistry): void {
  registry.registerTool(slowOperationTool);
}
