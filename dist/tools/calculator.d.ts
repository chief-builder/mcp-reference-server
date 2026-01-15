/**
 * Calculator tool - Example tool implementation
 */
import { z } from 'zod';
import type { ToolDefinition } from './registry.js';
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
export interface CalculatorOutput {
    result: number;
    expression: string;
}
export declare function calculateHandler(input: CalculatorInput): Promise<CalculatorOutput>;
export declare const calculatorTool: ToolDefinition<CalculatorInput, CalculatorOutput>;
//# sourceMappingURL=calculator.d.ts.map