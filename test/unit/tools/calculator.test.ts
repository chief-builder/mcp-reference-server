/**
 * Calculator Tool Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculatorTool,
  calculateHandler,
  registerCalculatorTool,
  CalculatorInputSchema,
  calculatorInputJsonSchema,
} from '../../../src/tools/calculator.js';
import { ToolRegistry } from '../../../src/tools/registry.js';

describe('Calculator Tool', () => {
  // =============================================================================
  // Input Schema Tests
  // =============================================================================
  describe('CalculatorInputSchema', () => {
    it('should validate correct input', () => {
      const result = CalculatorInputSchema.safeParse({
        operation: 'add',
        a: 5,
        b: 3,
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid operations', () => {
      const operations = ['add', 'subtract', 'multiply', 'divide'];
      for (const operation of operations) {
        const result = CalculatorInputSchema.safeParse({
          operation,
          a: 1,
          b: 1,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid operation', () => {
      const result = CalculatorInputSchema.safeParse({
        operation: 'modulo',
        a: 5,
        b: 3,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing operation', () => {
      const result = CalculatorInputSchema.safeParse({
        a: 5,
        b: 3,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-number operands', () => {
      const result = CalculatorInputSchema.safeParse({
        operation: 'add',
        a: 'five',
        b: 3,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing operands', () => {
      const result = CalculatorInputSchema.safeParse({
        operation: 'add',
      });
      expect(result.success).toBe(false);
    });

    it('should accept negative numbers', () => {
      const result = CalculatorInputSchema.safeParse({
        operation: 'add',
        a: -5,
        b: -3,
      });
      expect(result.success).toBe(true);
    });

    it('should accept decimal numbers', () => {
      const result = CalculatorInputSchema.safeParse({
        operation: 'multiply',
        a: 3.14,
        b: 2.5,
      });
      expect(result.success).toBe(true);
    });

    it('should accept zero', () => {
      const result = CalculatorInputSchema.safeParse({
        operation: 'add',
        a: 0,
        b: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  // =============================================================================
  // JSON Schema Tests
  // =============================================================================
  describe('calculatorInputJsonSchema', () => {
    it('should have type object', () => {
      expect(calculatorInputJsonSchema.type).toBe('object');
    });

    it('should have required properties', () => {
      expect(calculatorInputJsonSchema.required).toEqual(['operation', 'a', 'b']);
    });

    it('should have operation enum', () => {
      expect(calculatorInputJsonSchema.properties?.operation.enum).toEqual([
        'add',
        'subtract',
        'multiply',
        'divide',
      ]);
    });

    it('should have number type for operands', () => {
      expect(calculatorInputJsonSchema.properties?.a.type).toBe('number');
      expect(calculatorInputJsonSchema.properties?.b.type).toBe('number');
    });

    it('should not allow additional properties', () => {
      expect(calculatorInputJsonSchema.additionalProperties).toBe(false);
    });
  });

  // =============================================================================
  // Handler Tests - Basic Operations
  // =============================================================================
  describe('calculateHandler', () => {
    describe('addition', () => {
      it('should add two positive numbers', async () => {
        const result = await calculateHandler({ operation: 'add', a: 5, b: 3 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(8);
        expect(content.expression).toBe('5 + 3 = 8');
      });

      it('should add negative numbers', async () => {
        const result = await calculateHandler({ operation: 'add', a: -5, b: -3 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(-8);
      });

      it('should add zero', async () => {
        const result = await calculateHandler({ operation: 'add', a: 5, b: 0 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(5);
      });

      it('should add decimal numbers', async () => {
        const result = await calculateHandler({ operation: 'add', a: 1.5, b: 2.5 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(4);
      });
    });

    describe('subtraction', () => {
      it('should subtract two numbers', async () => {
        const result = await calculateHandler({ operation: 'subtract', a: 10, b: 4 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(6);
        expect(content.expression).toBe('10 - 4 = 6');
      });

      it('should handle negative result', async () => {
        const result = await calculateHandler({ operation: 'subtract', a: 3, b: 7 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(-4);
      });
    });

    describe('multiplication', () => {
      it('should multiply two numbers', async () => {
        const result = await calculateHandler({ operation: 'multiply', a: 7, b: 6 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(42);
        expect(content.expression).toBe('7 * 6 = 42');
      });

      it('should multiply by zero', async () => {
        const result = await calculateHandler({ operation: 'multiply', a: 100, b: 0 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(0);
      });

      it('should handle large numbers', async () => {
        const result = await calculateHandler({
          operation: 'multiply',
          a: 1000000,
          b: 1000000,
        });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(1000000000000);
      });
    });

    describe('division', () => {
      it('should divide two numbers', async () => {
        const result = await calculateHandler({ operation: 'divide', a: 20, b: 4 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(5);
        expect(content.expression).toBe('20 / 4 = 5');
      });

      it('should handle decimal results', async () => {
        const result = await calculateHandler({ operation: 'divide', a: 10, b: 4 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(2.5);
      });

      it('should return error for division by zero', async () => {
        const result = await calculateHandler({ operation: 'divide', a: 10, b: 0 });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Division by zero');
      });

      it('should divide zero by non-zero', async () => {
        const result = await calculateHandler({ operation: 'divide', a: 0, b: 5 });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.result).toBe(0);
      });
    });

    describe('error handling', () => {
      it('should return error for invalid input', async () => {
        const result = await calculateHandler({ operation: 'add', a: 'not a number', b: 3 });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid input');
      });

      it('should return error for missing fields', async () => {
        const result = await calculateHandler({ operation: 'add' });
        expect(result.isError).toBe(true);
      });

      it('should return error for invalid operation', async () => {
        const result = await calculateHandler({ operation: 'power', a: 2, b: 3 });
        expect(result.isError).toBe(true);
      });
    });
  });

  // =============================================================================
  // Tool Definition Tests
  // =============================================================================
  describe('calculatorTool', () => {
    it('should have correct name', () => {
      expect(calculatorTool.name).toBe('calculate');
    });

    it('should have a title', () => {
      expect(calculatorTool.title).toBe('Calculator');
    });

    it('should have a description', () => {
      expect(calculatorTool.description).toBeTruthy();
      expect(calculatorTool.description).toContain('arithmetic');
    });

    it('should have input schema', () => {
      expect(calculatorTool.inputSchema).toBeDefined();
      expect(calculatorTool.inputSchema.type).toBe('object');
    });

    it('should have SEP-1303 annotations', () => {
      expect(calculatorTool.annotations).toBeDefined();
      expect(calculatorTool.annotations?.readOnlyHint).toBe(true);
      expect(calculatorTool.annotations?.destructiveHint).toBe(false);
      expect(calculatorTool.annotations?.idempotentHint).toBe(true);
      expect(calculatorTool.annotations?.openWorldHint).toBe(false);
    });

    it('should have handler function', () => {
      expect(calculatorTool.handler).toBeDefined();
      expect(typeof calculatorTool.handler).toBe('function');
    });
  });

  // =============================================================================
  // Registration Tests
  // =============================================================================
  describe('registerCalculatorTool', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistry();
    });

    it('should register calculator tool', () => {
      expect(registry.getTool('calculate')).toBeUndefined();
      registerCalculatorTool(registry);
      expect(registry.getTool('calculate')).toBeDefined();
    });

    it('should register with correct properties', () => {
      registerCalculatorTool(registry);
      const tool = registry.getTool('calculate');
      expect(tool?.name).toBe('calculate');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be listable after registration', () => {
      registerCalculatorTool(registry);
      const tools = registry.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0].name).toBe('calculate');
    });
  });
});
