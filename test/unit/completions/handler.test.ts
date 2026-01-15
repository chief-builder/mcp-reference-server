/**
 * Completions Handler Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CompletionHandler,
  CompletionParams,
  CompletionResult,
  filterByPrefix,
  applyCompletionLimits,
  registerFortuneTellerCompletions,
} from '../../../src/completions/handler.js';
import { getFortuneCompletions } from '../../../src/tools/fortune-teller.js';

describe('Completions Handler', () => {
  // =============================================================================
  // Helper Function Tests
  // =============================================================================
  describe('filterByPrefix', () => {
    it('should return all values when prefix is empty', () => {
      const values = ['apple', 'banana', 'cherry'];
      expect(filterByPrefix(values, '')).toEqual(values);
    });

    it('should filter values by prefix (case-insensitive)', () => {
      const values = ['apple', 'apricot', 'banana', 'cherry'];
      expect(filterByPrefix(values, 'ap')).toEqual(['apple', 'apricot']);
    });

    it('should be case-insensitive', () => {
      const values = ['Apple', 'apricot', 'BANANA'];
      expect(filterByPrefix(values, 'A')).toEqual(['Apple', 'apricot']);
      expect(filterByPrefix(values, 'a')).toEqual(['Apple', 'apricot']);
    });

    it('should return empty array when no matches', () => {
      const values = ['apple', 'banana', 'cherry'];
      expect(filterByPrefix(values, 'xyz')).toEqual([]);
    });

    it('should handle empty values array', () => {
      expect(filterByPrefix([], 'test')).toEqual([]);
    });
  });

  describe('applyCompletionLimits', () => {
    it('should return all values when under limit', () => {
      const values = ['a', 'b', 'c'];
      const result = applyCompletionLimits(values, 20);
      expect(result.values).toEqual(['a', 'b', 'c']);
      expect(result.hasMore).toBeUndefined();
      expect(result.total).toBeUndefined();
    });

    it('should limit values and set hasMore when over limit', () => {
      const values = Array.from({ length: 25 }, (_, i) => `item${i}`);
      const result = applyCompletionLimits(values, 20);
      expect(result.values).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(25);
    });

    it('should not set hasMore when exactly at limit', () => {
      const values = Array.from({ length: 20 }, (_, i) => `item${i}`);
      const result = applyCompletionLimits(values, 20);
      expect(result.values).toHaveLength(20);
      expect(result.hasMore).toBeUndefined();
      expect(result.total).toBeUndefined();
    });

    it('should use default limit of 20', () => {
      const values = Array.from({ length: 25 }, (_, i) => `item${i}`);
      const result = applyCompletionLimits(values);
      expect(result.values).toHaveLength(20);
      expect(result.hasMore).toBe(true);
    });

    it('should handle custom limits', () => {
      const values = ['a', 'b', 'c', 'd', 'e'];
      const result = applyCompletionLimits(values, 3);
      expect(result.values).toEqual(['a', 'b', 'c']);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });
  });

  // =============================================================================
  // CompletionHandler Class Tests
  // =============================================================================
  describe('CompletionHandler', () => {
    let handler: CompletionHandler;

    beforeEach(() => {
      handler = new CompletionHandler();
    });

    // ===========================================================================
    // Provider Registration Tests
    // ===========================================================================
    describe('registerArgumentProvider', () => {
      it('should register a provider for tool argument', () => {
        const provider = () => ['value1', 'value2'];
        handler.registerArgumentProvider('myTool', 'myArg', provider);
        expect(handler.hasArgumentProvider('myTool', 'myArg')).toBe(true);
      });

      it('should return false for unregistered providers', () => {
        expect(handler.hasArgumentProvider('nonExistent', 'arg')).toBe(false);
      });

      it('should list registered argument providers', () => {
        handler.registerArgumentProvider('tool1', 'arg1', () => []);
        handler.registerArgumentProvider('tool2', 'arg2', () => []);
        const keys = handler.getRegisteredArgumentProviders();
        expect(keys).toContain('tool1:arg1');
        expect(keys).toContain('tool2:arg2');
      });

      it('should override existing provider', () => {
        handler.registerArgumentProvider('tool', 'arg', () => ['old']);
        handler.registerArgumentProvider('tool', 'arg', () => ['new']);
        expect(handler.getRegisteredArgumentProviders()).toHaveLength(1);
      });
    });

    describe('registerProvider (full API)', () => {
      it('should register a full provider', () => {
        const provider = async () => ({ completion: { values: [] } });
        handler.registerProvider('ref/tool', 'myTool', provider);
        expect(handler.hasProvider('ref/tool', 'myTool')).toBe(true);
      });

      it('should support ref/prompt type', () => {
        const provider = async () => ({ completion: { values: [] } });
        handler.registerProvider('ref/prompt', 'myPrompt', provider);
        expect(handler.hasProvider('ref/prompt', 'myPrompt')).toBe(true);
      });

      it('should support ref/resource type', () => {
        const provider = async () => ({ completion: { values: [] } });
        handler.registerProvider('ref/resource', 'myResource', provider);
        expect(handler.hasProvider('ref/resource', 'myResource')).toBe(true);
      });
    });

    // ===========================================================================
    // Handle Request Tests
    // ===========================================================================
    describe('handle', () => {
      it('should return empty values for unknown tool', async () => {
        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'unknown' },
          argument: { name: 'arg', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual([]);
      });

      it('should return completions from argument provider', async () => {
        handler.registerArgumentProvider('myTool', 'myArg', () => ['a', 'b', 'c']);

        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'myTool' },
          argument: { name: 'myArg', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['a', 'b', 'c']);
      });

      it('should filter completions by prefix', async () => {
        handler.registerArgumentProvider('myTool', 'myArg', () => [
          'apple',
          'apricot',
          'banana',
          'cherry',
        ]);

        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'myTool' },
          argument: { name: 'myArg', value: 'ap' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['apple', 'apricot']);
      });

      it('should apply 20 value limit', async () => {
        const manyValues = Array.from({ length: 30 }, (_, i) => `value${i}`);
        handler.registerArgumentProvider('myTool', 'myArg', () => manyValues);

        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'myTool' },
          argument: { name: 'myArg', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toHaveLength(20);
        expect(result.completion.hasMore).toBe(true);
        expect(result.completion.total).toBe(30);
      });

      it('should support async providers', async () => {
        handler.registerArgumentProvider('myTool', 'myArg', async () => {
          return ['async1', 'async2'];
        });

        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'myTool' },
          argument: { name: 'myArg', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['async1', 'async2']);
      });

      it('should use full provider for non-tool refs', async () => {
        const customResult: CompletionResult = {
          completion: { values: ['custom1', 'custom2'] },
        };
        handler.registerProvider('ref/prompt', 'myPrompt', async () => customResult);

        const params: CompletionParams = {
          ref: { type: 'ref/prompt', name: 'myPrompt' },
          argument: { name: 'arg', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['custom1', 'custom2']);
      });

      it('should prefer argument provider over full provider for ref/tool', async () => {
        handler.registerArgumentProvider('myTool', 'myArg', () => ['arg-provider']);
        handler.registerProvider('ref/tool', 'myTool', async () => ({
          completion: { values: ['full-provider'] },
        }));

        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'myTool' },
          argument: { name: 'myArg', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['arg-provider']);
      });

      it('should fall back to full provider when argument not registered', async () => {
        handler.registerProvider('ref/tool', 'myTool', async () => ({
          completion: { values: ['full-provider'] },
        }));

        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'myTool' },
          argument: { name: 'unknownArg', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['full-provider']);
      });

      it('should return empty values for invalid params', async () => {
        const invalidParams = {
          ref: { type: 'invalid', name: 'tool' },
          argument: { name: 'arg', value: '' },
        } as unknown as CompletionParams;

        const result = await handler.handle(invalidParams);
        expect(result.completion.values).toEqual([]);
      });

      it('should handle missing ref', async () => {
        const invalidParams = {
          argument: { name: 'arg', value: '' },
        } as unknown as CompletionParams;

        const result = await handler.handle(invalidParams);
        expect(result.completion.values).toEqual([]);
      });
    });

    // ===========================================================================
    // Backwards Compatibility
    // ===========================================================================
    describe('complete (backwards compatibility)', () => {
      it('should work as alias for handle', async () => {
        handler.registerArgumentProvider('myTool', 'myArg', () => ['value']);

        const request = {
          ref: { type: 'ref/tool' as const, name: 'myTool' },
          argument: { name: 'myArg', value: '' },
        };
        const result = await handler.complete(request);
        expect(result.completion.values).toEqual(['value']);
      });
    });
  });

  // =============================================================================
  // Fortune Teller Integration Tests
  // =============================================================================
  describe('Fortune Teller Integration', () => {
    let handler: CompletionHandler;

    beforeEach(() => {
      handler = new CompletionHandler();
      registerFortuneTellerCompletions(handler, getFortuneCompletions);
    });

    describe('registerFortuneTellerCompletions', () => {
      it('should register category provider', () => {
        expect(handler.hasArgumentProvider('tell_fortune', 'category')).toBe(true);
      });

      it('should register mood provider', () => {
        expect(handler.hasArgumentProvider('tell_fortune', 'mood')).toBe(true);
      });
    });

    describe('category completions', () => {
      it('should return all categories with empty prefix', async () => {
        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'tell_fortune' },
          argument: { name: 'category', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual([
          'love',
          'career',
          'health',
          'wealth',
          'general',
        ]);
      });

      it('should filter categories by prefix', async () => {
        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'tell_fortune' },
          argument: { name: 'category', value: 'l' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['love']);
      });

      it('should filter categories case-insensitively', async () => {
        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'tell_fortune' },
          argument: { name: 'category', value: 'H' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['health']);
      });

      it('should return empty for non-matching prefix', async () => {
        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'tell_fortune' },
          argument: { name: 'category', value: 'xyz' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual([]);
      });
    });

    describe('mood completions', () => {
      it('should return all moods with empty prefix', async () => {
        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'tell_fortune' },
          argument: { name: 'mood', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['optimistic', 'mysterious', 'cautious']);
      });

      it('should filter moods by prefix', async () => {
        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'tell_fortune' },
          argument: { name: 'mood', value: 'o' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['optimistic']);
      });

      it('should filter moods case-insensitively', async () => {
        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'tell_fortune' },
          argument: { name: 'mood', value: 'M' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual(['mysterious']);
      });
    });

    describe('unknown arguments', () => {
      it('should return empty for unknown argument', async () => {
        const params: CompletionParams = {
          ref: { type: 'ref/tool', name: 'tell_fortune' },
          argument: { name: 'unknown', value: '' },
        };
        const result = await handler.handle(params);
        expect(result.completion.values).toEqual([]);
      });
    });
  });

  // =============================================================================
  // hasMore Indicator Tests
  // =============================================================================
  describe('hasMore indicator', () => {
    let handler: CompletionHandler;

    beforeEach(() => {
      handler = new CompletionHandler();
    });

    it('should not include hasMore when results fit within limit', async () => {
      handler.registerArgumentProvider('tool', 'arg', () =>
        Array.from({ length: 15 }, (_, i) => `item${i}`)
      );

      const params: CompletionParams = {
        ref: { type: 'ref/tool', name: 'tool' },
        argument: { name: 'arg', value: '' },
      };
      const result = await handler.handle(params);
      expect(result.completion.hasMore).toBeUndefined();
      expect(result.completion.total).toBeUndefined();
    });

    it('should include hasMore when results exceed limit', async () => {
      handler.registerArgumentProvider('tool', 'arg', () =>
        Array.from({ length: 25 }, (_, i) => `item${i}`)
      );

      const params: CompletionParams = {
        ref: { type: 'ref/tool', name: 'tool' },
          argument: { name: 'arg', value: '' },
      };
      const result = await handler.handle(params);
      expect(result.completion.hasMore).toBe(true);
      expect(result.completion.total).toBe(25);
      expect(result.completion.values).toHaveLength(20);
    });

    it('should not include hasMore when exactly 20 results', async () => {
      handler.registerArgumentProvider('tool', 'arg', () =>
        Array.from({ length: 20 }, (_, i) => `item${i}`)
      );

      const params: CompletionParams = {
        ref: { type: 'ref/tool', name: 'tool' },
        argument: { name: 'arg', value: '' },
      };
      const result = await handler.handle(params);
      expect(result.completion.hasMore).toBeUndefined();
      expect(result.completion.total).toBeUndefined();
      expect(result.completion.values).toHaveLength(20);
    });
  });
});
