/**
 * Tool registration and lookup
 */
import type { z } from 'zod';
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
    name: string;
    description: string;
    inputSchema: z.ZodType<TInput>;
    handler: (input: TInput) => Promise<TOutput>;
}
export declare class ToolRegistry {
    private tools;
    register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void;
    unregister(name: string): boolean;
    get(name: string): ToolDefinition | undefined;
    list(): ToolDefinition[];
    has(name: string): boolean;
}
//# sourceMappingURL=registry.d.ts.map