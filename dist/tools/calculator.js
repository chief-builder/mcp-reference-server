/**
 * Calculator tool - Example tool implementation
 */
import { z } from 'zod';
export const CalculatorInputSchema = z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
});
export async function calculateHandler(input) {
    const { operation, a, b } = input;
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
            if (b === 0) {
                throw new Error('Division by zero');
            }
            result = a / b;
            operator = '/';
            break;
    }
    return {
        result,
        expression: `${a} ${operator} ${b} = ${result}`,
    };
}
export const calculatorTool = {
    name: 'calculator',
    description: 'Perform basic arithmetic operations: add, subtract, multiply, divide',
    inputSchema: CalculatorInputSchema,
    handler: calculateHandler,
};
//# sourceMappingURL=calculator.js.map