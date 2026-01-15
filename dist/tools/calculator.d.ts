/**
 * Calculator Tool
 *
 * Performs basic arithmetic operations: add, subtract, multiply, divide.
 * Implements SEP-1303 compliant annotations and error handling.
 */
import { z } from 'zod';
import type { Tool, ToolRegistry, JsonSchema, ToolResult } from './registry.js';
export declare const CalculatorInputSchema: z.ZodObject<{
    operation: z.ZodEnum<["add", "subtract", "multiply", "divide"]>;
    a: z.ZodNumber;
    b: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    operation: "add" | "subtract" | "multiply" | "divide";
    a: number;
    b: number;
}, {
    operation: "add" | "subtract" | "multiply" | "divide";
    a: number;
    b: number;
}>;
export type CalculatorInput = z.infer<typeof CalculatorInputSchema>;
export declare const calculatorInputJsonSchema: JsonSchema;
/**
 * Execute a calculation and return a SEP-1303 compliant ToolResult.
 */
export declare function calculateHandler(args: unknown): Promise<ToolResult>;
/**
 * Calculator tool definition with SEP-1303 annotations.
 */
export declare const calculatorTool: Tool;
/**
 * Register the calculator tool with a ToolRegistry.
 *
 * @param registry - The ToolRegistry to register with
 */
export declare function registerCalculatorTool(registry: ToolRegistry): void;
//# sourceMappingURL=calculator.d.ts.map