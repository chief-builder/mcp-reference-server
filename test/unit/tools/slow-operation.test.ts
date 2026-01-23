/**
 * Slow Operation Tool Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  slowOperationTool,
  slowOperationHandler,
  registerSlowOperationTool,
  SlowOperationInputSchema,
  slowOperationInputJsonSchema,
  sleep,
} from '../../../src/tools/slow-operation.js';
import { ToolRegistry } from '../../../src/tools/registry.js';

describe('Slow Operation Tool', () => {
  // =============================================================================
  // Input Schema Tests
  // =============================================================================
  describe('SlowOperationInputSchema', () => {
    it('should validate correct input', () => {
      const result = SlowOperationInputSchema.safeParse({
        duration_ms: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should accept zero duration', () => {
      const result = SlowOperationInputSchema.safeParse({
        duration_ms: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should accept maximum duration', () => {
      const result = SlowOperationInputSchema.safeParse({
        duration_ms: 300000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative duration', () => {
      const result = SlowOperationInputSchema.safeParse({
        duration_ms: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should reject duration exceeding maximum', () => {
      const result = SlowOperationInputSchema.safeParse({
        duration_ms: 300001,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer duration', () => {
      const result = SlowOperationInputSchema.safeParse({
        duration_ms: 100.5,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing duration_ms', () => {
      const result = SlowOperationInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject non-number duration_ms', () => {
      const result = SlowOperationInputSchema.safeParse({
        duration_ms: '100',
      });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // JSON Schema Tests
  // =============================================================================
  describe('slowOperationInputJsonSchema', () => {
    it('should have type object', () => {
      expect(slowOperationInputJsonSchema.type).toBe('object');
    });

    it('should have required properties', () => {
      expect(slowOperationInputJsonSchema.required).toEqual(['duration_ms']);
    });

    it('should have integer type for duration_ms', () => {
      expect(slowOperationInputJsonSchema.properties?.duration_ms.type).toBe('integer');
    });

    it('should have minimum constraint', () => {
      expect(slowOperationInputJsonSchema.properties?.duration_ms.minimum).toBe(0);
    });

    it('should have maximum constraint', () => {
      expect(slowOperationInputJsonSchema.properties?.duration_ms.maximum).toBe(300000);
    });

    it('should not allow additional properties', () => {
      expect(slowOperationInputJsonSchema.additionalProperties).toBe(false);
    });
  });

  // =============================================================================
  // Sleep Utility Tests
  // =============================================================================
  describe('sleep', () => {
    it('should sleep for approximately the specified duration', async () => {
      const duration = 50;
      const start = Date.now();
      await sleep(duration);
      const elapsed = Date.now() - start;
      // Allow some tolerance for timing
      expect(elapsed).toBeGreaterThanOrEqual(duration - 10);
      expect(elapsed).toBeLessThan(duration + 50);
    });

    it('should resolve immediately for zero duration', async () => {
      const start = Date.now();
      await sleep(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(20);
    });
  });

  // =============================================================================
  // Handler Tests
  // =============================================================================
  describe('slowOperationHandler', () => {
    it('should sleep for the specified duration', async () => {
      const duration = 50;
      const start = Date.now();
      const result = await slowOperationHandler({ duration_ms: duration });
      const elapsed = Date.now() - start;

      expect(result.isError).toBeFalsy();
      expect(elapsed).toBeGreaterThanOrEqual(duration - 10);

      const content = JSON.parse(result.content[0].text);
      expect(content.requested_duration_ms).toBe(duration);
      expect(content.actual_duration_ms).toBeGreaterThanOrEqual(duration - 10);
      expect(content.message).toContain('Slept for');
    });

    it('should return success for zero duration', async () => {
      const result = await slowOperationHandler({ duration_ms: 0 });
      expect(result.isError).toBeFalsy();

      const content = JSON.parse(result.content[0].text);
      expect(content.requested_duration_ms).toBe(0);
    });

    it('should return error for invalid input', async () => {
      const result = await slowOperationHandler({ duration_ms: 'not a number' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid input');
    });

    it('should return error for negative duration', async () => {
      const result = await slowOperationHandler({ duration_ms: -100 });
      expect(result.isError).toBe(true);
    });

    it('should return error for missing duration_ms', async () => {
      const result = await slowOperationHandler({});
      expect(result.isError).toBe(true);
    });
  });

  // =============================================================================
  // Tool Definition Tests
  // =============================================================================
  describe('slowOperationTool', () => {
    it('should have correct name', () => {
      expect(slowOperationTool.name).toBe('slow_operation');
    });

    it('should have a title', () => {
      expect(slowOperationTool.title).toBe('Slow Operation');
    });

    it('should have a description', () => {
      expect(slowOperationTool.description).toBeTruthy();
      expect(slowOperationTool.description).toContain('timeout');
    });

    it('should have input schema', () => {
      expect(slowOperationTool.inputSchema).toBeDefined();
      expect(slowOperationTool.inputSchema.type).toBe('object');
    });

    it('should have SEP-1303 annotations', () => {
      expect(slowOperationTool.annotations).toBeDefined();
      expect(slowOperationTool.annotations?.readOnlyHint).toBe(true);
      expect(slowOperationTool.annotations?.destructiveHint).toBe(false);
      expect(slowOperationTool.annotations?.idempotentHint).toBe(true);
      expect(slowOperationTool.annotations?.openWorldHint).toBe(false);
    });

    it('should have handler function', () => {
      expect(slowOperationTool.handler).toBeDefined();
      expect(typeof slowOperationTool.handler).toBe('function');
    });
  });

  // =============================================================================
  // Registration Tests
  // =============================================================================
  describe('registerSlowOperationTool', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistry();
    });

    it('should register slow_operation tool', () => {
      expect(registry.getTool('slow_operation')).toBeUndefined();
      registerSlowOperationTool(registry);
      expect(registry.getTool('slow_operation')).toBeDefined();
    });

    it('should register with correct properties', () => {
      registerSlowOperationTool(registry);
      const tool = registry.getTool('slow_operation');
      expect(tool?.name).toBe('slow_operation');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should be listable after registration', () => {
      registerSlowOperationTool(registry);
      const tools = registry.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0].name).toBe('slow_operation');
    });
  });
});
