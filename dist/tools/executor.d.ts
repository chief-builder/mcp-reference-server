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
export declare class ToolExecutor {
    private readonly options;
    constructor(options?: ToolExecutorOptions);
    execute(tool: ToolDefinition, input: unknown): Promise<ToolExecutionResult>;
    private executeWithTimeout;
}
//# sourceMappingURL=executor.d.ts.map