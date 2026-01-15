/**
 * Calculator Tool
 *
 * Performs basic arithmetic operations: add, subtract, multiply, divide.
 * Implements SEP-1303 compliant annotations and error handling.
 */
import { z } from 'zod';
import { createToolErrorResult, createToolSuccessResult } from '../protocol/errors.js';
// =============================================================================
// Input Schema (Zod for internal validation)
// =============================================================================
export const CalculatorInputSchema = z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
});
// =============================================================================
// JSON Schema (for MCP tool definition)
// =============================================================================
export const calculatorInputJsonSchema = {
    type: 'object',
    properties: {
        operation: {
            type: 'string',
            enum: ['add', 'subtract', 'multiply', 'divide'],
            description: 'The arithmetic operation to perform',
        },
        a: {
            type: 'number',
            description: 'First operand',
        },
        b: {
            type: 'number',
            description: 'Second operand',
        },
    },
    required: ['operation', 'a', 'b'],
    additionalProperties: false,
};
// =============================================================================
// Tool Handler
// =============================================================================
/**
 * Execute a calculation and return a SEP-1303 compliant ToolResult.
 */
export async function calculateHandler(args) {
    // Validate input with Zod
    const parseResult = CalculatorInputSchema.safeParse(args);
    if (!parseResult.success) {
        return createToolErrorResult('Invalid input: ' + parseResult.error.errors.map(e => e.message).join(', '), 'calculate');
    }
    const { operation, a, b } = parseResult.data;
    let result;
    let operator;
    switch (operation) {
        case 'add':
            result = a + b;
            operator = '+';
            break;
        case 'subtract':
            result = a - b;
            operator = '-';
            break;
        case 'multiply':
            result = a * b;
            operator = '*';
            break;
        case 'divide':
            // Handle division by zero - return error result per SEP-1303
            if (b === 0) {
                return createToolErrorResult('Division by zero is not allowed', 'calculate');
            }
            result = a / b;
            operator = '/';
            break;
        default:
            // This should never happen due to Zod validation, but handle gracefully
            return createToolErrorResult(`Invalid operation: ${operation}`, 'calculate');
    }
    // Return successful result
    const expression = `${a} ${operator} ${b} = ${result}`;
    return createToolSuccessResult(JSON.stringify({
        result,
        expression,
    }));
}
// =============================================================================
// Tool Definition
// =============================================================================
/**
 * Calculator tool definition with SEP-1303 annotations.
 */
export const calculatorTool = {
    name: 'calculate',
    title: 'Calculator',
    description: 'Perform basic arithmetic operations. Supports addition, subtraction, multiplication, and division of two numbers.',
    inputSchema: calculatorInputJsonSchema,
    annotations: {
        readOnlyHint: true, // Does not modify any state
        destructiveHint: false, // Cannot delete or modify data
        idempotentHint: true, // Same inputs always produce same outputs
        openWorldHint: false, // No external services or APIs
    },
    handler: calculateHandler,
};
// =============================================================================
// Registration Helper
// =============================================================================
/**
 * Register the calculator tool with a ToolRegistry.
 *
 * @param registry - The ToolRegistry to register with
 */
export function registerCalculatorTool(registry) {
    registry.registerTool(calculatorTool);
}
//# sourceMappingURL=calculator.js.map