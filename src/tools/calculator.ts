/**
 * Calculator tool - Example tool implementation
 */

import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

export const CalculatorInputSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
  a: z.number(),
  b: z.number(),
});

export type CalculatorInput = z.infer<typeof CalculatorInputSchema>;

export interface CalculatorOutput {
  result: number;
  expression: string;
}

export async function calculateHandler(input: CalculatorInput): Promise<CalculatorOutput> {
  const { operation, a, b } = input;
  let result: number;
  let operator: string;

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

export const calculatorTool: ToolDefinition<CalculatorInput, CalculatorOutput> = {
  name: 'calculator',
  description: 'Perform basic arithmetic operations: add, subtract, multiply, divide',
  inputSchema: CalculatorInputSchema,
  handler: calculateHandler,
};
