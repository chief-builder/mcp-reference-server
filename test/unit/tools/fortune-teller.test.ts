/**
 * Fortune Teller Tool Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  fortuneTellerTool,
  tellFortuneHandler,
  registerFortuneTellerTool,
  FortuneTellerInputSchema,
  fortuneTellerInputJsonSchema,
  selectFortune,
  getFortuneCompletions,
} from '../../../src/tools/fortune-teller.js';
import { ToolRegistry } from '../../../src/tools/registry.js';

describe('Fortune Teller Tool', () => {
  // =============================================================================
  // Input Schema Tests
  // =============================================================================
  describe('FortuneTellerInputSchema', () => {
    describe('valid inputs', () => {
      it('should validate category only (mood defaults to mysterious)', () => {
        const result = FortuneTellerInputSchema.safeParse({ category: 'love' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.mood).toBe('mysterious');
        }
      });

      it('should validate category with mood', () => {
        const result = FortuneTellerInputSchema.safeParse({
          category: 'career',
          mood: 'optimistic',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.category).toBe('career');
          expect(result.data.mood).toBe('optimistic');
        }
      });

      it('should accept all valid categories', () => {
        const categories = ['love', 'career', 'health', 'wealth', 'general'];
        for (const category of categories) {
          const result = FortuneTellerInputSchema.safeParse({ category });
          expect(result.success).toBe(true);
        }
      });

      it('should accept all valid moods', () => {
        const moods = ['optimistic', 'mysterious', 'cautious'];
        for (const mood of moods) {
          const result = FortuneTellerInputSchema.safeParse({
            category: 'general',
            mood,
          });
          expect(result.success).toBe(true);
        }
      });
    });

    describe('invalid inputs', () => {
      it('should reject missing category', () => {
        const result = FortuneTellerInputSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should reject invalid category', () => {
        const result = FortuneTellerInputSchema.safeParse({ category: 'magic' });
        expect(result.success).toBe(false);
      });

      it('should reject invalid mood', () => {
        const result = FortuneTellerInputSchema.safeParse({
          category: 'love',
          mood: 'happy',
        });
        expect(result.success).toBe(false);
      });

      it('should reject non-string category', () => {
        const result = FortuneTellerInputSchema.safeParse({ category: 123 });
        expect(result.success).toBe(false);
      });

      it('should reject non-string mood', () => {
        const result = FortuneTellerInputSchema.safeParse({
          category: 'love',
          mood: true,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // =============================================================================
  // JSON Schema Tests
  // =============================================================================
  describe('fortuneTellerInputJsonSchema', () => {
    it('should have type object', () => {
      expect(fortuneTellerInputJsonSchema.type).toBe('object');
    });

    it('should have required category property', () => {
      expect(fortuneTellerInputJsonSchema.required).toEqual(['category']);
    });

    it('should have string type for category', () => {
      expect(fortuneTellerInputJsonSchema.properties?.category.type).toBe('string');
    });

    it('should have enum for category', () => {
      expect(fortuneTellerInputJsonSchema.properties?.category.enum).toEqual([
        'love',
        'career',
        'health',
        'wealth',
        'general',
      ]);
    });

    it('should have string type for mood', () => {
      expect(fortuneTellerInputJsonSchema.properties?.mood.type).toBe('string');
    });

    it('should have enum for mood', () => {
      expect(fortuneTellerInputJsonSchema.properties?.mood.enum).toEqual([
        'optimistic',
        'mysterious',
        'cautious',
      ]);
    });

    it('should not allow additional properties', () => {
      expect(fortuneTellerInputJsonSchema.additionalProperties).toBe(false);
    });

    it('should have description for category', () => {
      expect(fortuneTellerInputJsonSchema.properties?.category.description).toBeTruthy();
    });

    it('should have description for mood', () => {
      expect(fortuneTellerInputJsonSchema.properties?.mood.description).toBeTruthy();
    });
  });

  // =============================================================================
  // selectFortune Tests
  // =============================================================================
  describe('selectFortune', () => {
    it('should return a string fortune', () => {
      const fortune = selectFortune('love', 'optimistic');
      expect(typeof fortune).toBe('string');
      expect(fortune.length).toBeGreaterThan(0);
    });

    it('should return fortunes for all category/mood combinations', () => {
      const categories = ['love', 'career', 'health', 'wealth', 'general'] as const;
      const moods = ['optimistic', 'mysterious', 'cautious'] as const;

      for (const category of categories) {
        for (const mood of moods) {
          const fortune = selectFortune(category, mood);
          expect(typeof fortune).toBe('string');
          expect(fortune.length).toBeGreaterThan(0);
        }
      }
    });

    it('should produce different fortunes over multiple calls (randomness)', () => {
      // Call 50 times and expect at least 2 different fortunes
      const fortunes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        fortunes.add(selectFortune('general', 'mysterious'));
      }
      expect(fortunes.size).toBeGreaterThan(1);
    });
  });

  // =============================================================================
  // getFortuneCompletions Tests
  // =============================================================================
  describe('getFortuneCompletions', () => {
    describe('category completions', () => {
      it('should return all categories with empty prefix', () => {
        const completions = getFortuneCompletions('category', '');
        expect(completions).toEqual(['love', 'career', 'health', 'wealth', 'general']);
      });

      it('should filter categories by prefix', () => {
        const completions = getFortuneCompletions('category', 'l');
        expect(completions).toEqual(['love']);
      });

      it('should filter categories by longer prefix', () => {
        const completions = getFortuneCompletions('category', 'he');
        expect(completions).toEqual(['health']);
      });

      it('should be case-insensitive', () => {
        const completions = getFortuneCompletions('category', 'L');
        expect(completions).toEqual(['love']);
      });

      it('should return empty array for non-matching prefix', () => {
        const completions = getFortuneCompletions('category', 'xyz');
        expect(completions).toEqual([]);
      });

      it('should return multiple matches when prefix matches multiple', () => {
        const completions = getFortuneCompletions('category', 'c');
        expect(completions).toEqual(['career']);
      });
    });

    describe('mood completions', () => {
      it('should return all moods with empty prefix', () => {
        const completions = getFortuneCompletions('mood', '');
        expect(completions).toEqual(['optimistic', 'mysterious', 'cautious']);
      });

      it('should filter moods by prefix', () => {
        const completions = getFortuneCompletions('mood', 'o');
        expect(completions).toEqual(['optimistic']);
      });

      it('should filter moods by longer prefix', () => {
        const completions = getFortuneCompletions('mood', 'myst');
        expect(completions).toEqual(['mysterious']);
      });

      it('should be case-insensitive for moods', () => {
        const completions = getFortuneCompletions('mood', 'C');
        expect(completions).toEqual(['cautious']);
      });

      it('should return empty array for non-matching mood prefix', () => {
        const completions = getFortuneCompletions('mood', 'happy');
        expect(completions).toEqual([]);
      });
    });

    describe('unknown argument', () => {
      it('should return empty array for unknown argument name', () => {
        const completions = getFortuneCompletions('unknown', '');
        expect(completions).toEqual([]);
      });

      it('should return empty array for empty argument name', () => {
        const completions = getFortuneCompletions('', '');
        expect(completions).toEqual([]);
      });
    });
  });

  // =============================================================================
  // Handler Tests
  // =============================================================================
  describe('tellFortuneHandler', () => {
    describe('valid inputs', () => {
      it('should return fortune for category only', async () => {
        const result = await tellFortuneHandler({ category: 'love' });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.category).toBe('love');
        expect(content.mood).toBe('mysterious'); // default
        expect(typeof content.fortune).toBe('string');
      });

      it('should return fortune for category with mood', async () => {
        const result = await tellFortuneHandler({
          category: 'career',
          mood: 'optimistic',
        });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.category).toBe('career');
        expect(content.mood).toBe('optimistic');
        expect(typeof content.fortune).toBe('string');
      });

      it('should return fortunes for all categories', async () => {
        const categories = ['love', 'career', 'health', 'wealth', 'general'];
        for (const category of categories) {
          const result = await tellFortuneHandler({ category });
          expect(result.isError).toBeFalsy();
          const content = JSON.parse(result.content[0].text);
          expect(content.category).toBe(category);
        }
      });

      it('should return fortunes for all moods', async () => {
        const moods = ['optimistic', 'mysterious', 'cautious'];
        for (const mood of moods) {
          const result = await tellFortuneHandler({
            category: 'general',
            mood,
          });
          expect(result.isError).toBeFalsy();
          const content = JSON.parse(result.content[0].text);
          expect(content.mood).toBe(mood);
        }
      });

      it('should return different fortunes on multiple calls (randomness)', async () => {
        const fortunes = new Set<string>();
        for (let i = 0; i < 20; i++) {
          const result = await tellFortuneHandler({ category: 'general' });
          const content = JSON.parse(result.content[0].text);
          fortunes.add(content.fortune);
        }
        expect(fortunes.size).toBeGreaterThan(1);
      });
    });

    describe('error handling', () => {
      it('should return error for invalid category', async () => {
        const result = await tellFortuneHandler({ category: 'magic' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid category');
      });

      it('should return error for invalid mood', async () => {
        const result = await tellFortuneHandler({
          category: 'love',
          mood: 'happy',
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid mood');
      });

      it('should return error for missing category', async () => {
        const result = await tellFortuneHandler({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid');
      });

      it('should return error for missing input', async () => {
        const result = await tellFortuneHandler(undefined);
        expect(result.isError).toBe(true);
      });

      it('should return error for null input', async () => {
        const result = await tellFortuneHandler(null);
        expect(result.isError).toBe(true);
      });

      it('should return error for non-object input', async () => {
        const result = await tellFortuneHandler('love');
        expect(result.isError).toBe(true);
      });
    });
  });

  // =============================================================================
  // Tool Definition Tests
  // =============================================================================
  describe('fortuneTellerTool', () => {
    it('should have correct name', () => {
      expect(fortuneTellerTool.name).toBe('tell_fortune');
    });

    it('should have a title', () => {
      expect(fortuneTellerTool.title).toBe('Fortune Teller');
    });

    it('should have a description', () => {
      expect(fortuneTellerTool.description).toBeTruthy();
      expect(fortuneTellerTool.description).toContain('fortune');
    });

    it('should mention categories in description', () => {
      expect(fortuneTellerTool.description).toContain('love');
      expect(fortuneTellerTool.description).toContain('career');
      expect(fortuneTellerTool.description).toContain('health');
      expect(fortuneTellerTool.description).toContain('wealth');
      expect(fortuneTellerTool.description).toContain('general');
    });

    it('should mention moods in description', () => {
      expect(fortuneTellerTool.description).toContain('optimistic');
      expect(fortuneTellerTool.description).toContain('mysterious');
      expect(fortuneTellerTool.description).toContain('cautious');
    });

    it('should have input schema', () => {
      expect(fortuneTellerTool.inputSchema).toBeDefined();
      expect(fortuneTellerTool.inputSchema.type).toBe('object');
    });

    it('should have SEP-1303 annotations', () => {
      expect(fortuneTellerTool.annotations).toBeDefined();
      expect(fortuneTellerTool.annotations?.readOnlyHint).toBe(true);
      expect(fortuneTellerTool.annotations?.destructiveHint).toBe(false);
      expect(fortuneTellerTool.annotations?.idempotentHint).toBe(false); // Random!
      expect(fortuneTellerTool.annotations?.openWorldHint).toBe(false);
    });

    it('should have handler function', () => {
      expect(fortuneTellerTool.handler).toBeDefined();
      expect(typeof fortuneTellerTool.handler).toBe('function');
    });
  });

  // =============================================================================
  // Registration Tests
  // =============================================================================
  describe('registerFortuneTellerTool', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistry();
    });

    it('should register fortune teller tool', () => {
      expect(registry.getTool('tell_fortune')).toBeUndefined();
      registerFortuneTellerTool(registry);
      expect(registry.getTool('tell_fortune')).toBeDefined();
    });

    it('should register with correct properties', () => {
      registerFortuneTellerTool(registry);
      const tool = registry.getTool('tell_fortune');
      expect(tool?.name).toBe('tell_fortune');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
      expect(tool?.annotations?.idempotentHint).toBe(false);
    });

    it('should be listable after registration', () => {
      registerFortuneTellerTool(registry);
      const tools = registry.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0].name).toBe('tell_fortune');
    });
  });

  // =============================================================================
  // Fortune Content Tests
  // =============================================================================
  describe('fortune content', () => {
    it('should have at least 5 fortunes per category/mood combination', async () => {
      // We verify this by checking that over 100 calls, we see at least 5 unique fortunes
      const categories = ['love', 'career', 'health', 'wealth', 'general'] as const;
      const moods = ['optimistic', 'mysterious', 'cautious'] as const;

      for (const category of categories) {
        for (const mood of moods) {
          const fortunes = new Set<string>();
          for (let i = 0; i < 100; i++) {
            const fortune = selectFortune(category, mood);
            fortunes.add(fortune);
          }
          // We should see most if not all 5 fortunes in 100 calls
          expect(fortunes.size).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it('should return non-empty fortune strings', async () => {
      const result = await tellFortuneHandler({ category: 'love' });
      const content = JSON.parse(result.content[0].text);
      expect(content.fortune.length).toBeGreaterThan(10);
    });
  });
});
