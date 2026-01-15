/**
 * Dice Roller Tool Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  diceRollerTool,
  rollDiceHandler,
  registerDiceRollerTool,
  DiceRollerInputSchema,
  diceRollerInputJsonSchema,
  parseDiceNotation,
  rollDie,
  rollDice,
} from '../../../src/tools/dice-roller.js';
import { ToolRegistry } from '../../../src/tools/registry.js';

describe('Dice Roller Tool', () => {
  // =============================================================================
  // Input Schema Tests
  // =============================================================================
  describe('DiceRollerInputSchema', () => {
    it('should validate correct notation input', () => {
      const result = DiceRollerInputSchema.safeParse({ notation: '2d6' });
      expect(result.success).toBe(true);
    });

    it('should accept notation with modifier', () => {
      const result = DiceRollerInputSchema.safeParse({ notation: '1d20+5' });
      expect(result.success).toBe(true);
    });

    it('should reject missing notation', () => {
      const result = DiceRollerInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject empty notation', () => {
      const result = DiceRollerInputSchema.safeParse({ notation: '' });
      expect(result.success).toBe(false);
    });

    it('should reject non-string notation', () => {
      const result = DiceRollerInputSchema.safeParse({ notation: 123 });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // JSON Schema Tests
  // =============================================================================
  describe('diceRollerInputJsonSchema', () => {
    it('should have type object', () => {
      expect(diceRollerInputJsonSchema.type).toBe('object');
    });

    it('should have required notation property', () => {
      expect(diceRollerInputJsonSchema.required).toEqual(['notation']);
    });

    it('should have string type for notation', () => {
      expect(diceRollerInputJsonSchema.properties?.notation.type).toBe('string');
    });

    it('should not allow additional properties', () => {
      expect(diceRollerInputJsonSchema.additionalProperties).toBe(false);
    });

    it('should have description for notation', () => {
      expect(diceRollerInputJsonSchema.properties?.notation.description).toBeTruthy();
    });
  });

  // =============================================================================
  // Dice Notation Parser Tests
  // =============================================================================
  describe('parseDiceNotation', () => {
    describe('valid notations', () => {
      it('should parse simple notation (d20)', () => {
        const result = parseDiceNotation('d20');
        expect(result).toEqual({ count: 1, sides: 20, modifier: 0 });
      });

      it('should parse notation with count (2d6)', () => {
        const result = parseDiceNotation('2d6');
        expect(result).toEqual({ count: 2, sides: 6, modifier: 0 });
      });

      it('should parse notation with positive modifier (1d20+5)', () => {
        const result = parseDiceNotation('1d20+5');
        expect(result).toEqual({ count: 1, sides: 20, modifier: 5 });
      });

      it('should parse notation with negative modifier (3d8-2)', () => {
        const result = parseDiceNotation('3d8-2');
        expect(result).toEqual({ count: 3, sides: 8, modifier: -2 });
      });

      it('should parse notation without count but with modifier (d6+3)', () => {
        const result = parseDiceNotation('d6+3');
        expect(result).toEqual({ count: 1, sides: 6, modifier: 3 });
      });

      it('should handle uppercase notation (2D6)', () => {
        const result = parseDiceNotation('2D6');
        expect(result).toEqual({ count: 2, sides: 6, modifier: 0 });
      });

      it('should handle whitespace (  2d6  )', () => {
        const result = parseDiceNotation('  2d6  ');
        expect(result).toEqual({ count: 2, sides: 6, modifier: 0 });
      });

      it('should parse d4', () => {
        const result = parseDiceNotation('d4');
        expect(result).toEqual({ count: 1, sides: 4, modifier: 0 });
      });

      it('should parse d100', () => {
        const result = parseDiceNotation('d100');
        expect(result).toEqual({ count: 1, sides: 100, modifier: 0 });
      });

      it('should parse maximum dice count (100d6)', () => {
        const result = parseDiceNotation('100d6');
        expect(result).toEqual({ count: 100, sides: 6, modifier: 0 });
      });
    });

    describe('invalid notations', () => {
      it('should reject invalid format', () => {
        expect(parseDiceNotation('roll 2d6')).toBeNull();
      });

      it('should reject missing d separator', () => {
        expect(parseDiceNotation('26')).toBeNull();
      });

      it('should reject invalid die size (d7)', () => {
        expect(parseDiceNotation('d7')).toBeNull();
      });

      it('should reject invalid die size (d3)', () => {
        expect(parseDiceNotation('d3')).toBeNull();
      });

      it('should reject zero dice (0d6)', () => {
        expect(parseDiceNotation('0d6')).toBeNull();
      });

      it('should reject too many dice (101d6)', () => {
        expect(parseDiceNotation('101d6')).toBeNull();
      });

      it('should reject empty string', () => {
        expect(parseDiceNotation('')).toBeNull();
      });

      it('should reject only modifier (+5)', () => {
        expect(parseDiceNotation('+5')).toBeNull();
      });

      it('should reject spaces in notation', () => {
        expect(parseDiceNotation('2 d 6')).toBeNull();
      });
    });
  });

  // =============================================================================
  // Roll Function Tests
  // =============================================================================
  describe('rollDie', () => {
    it('should return a value between 1 and sides (d6)', () => {
      for (let i = 0; i < 100; i++) {
        const result = rollDie(6);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(6);
      }
    });

    it('should return a value between 1 and sides (d20)', () => {
      for (let i = 0; i < 100; i++) {
        const result = rollDie(20);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
      }
    });

    it('should return a value between 1 and sides (d100)', () => {
      for (let i = 0; i < 100; i++) {
        const result = rollDie(100);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(100);
      }
    });

    it('should return integer values', () => {
      for (let i = 0; i < 20; i++) {
        const result = rollDie(6);
        expect(Number.isInteger(result)).toBe(true);
      }
    });
  });

  describe('rollDice', () => {
    it('should return correct number of rolls', () => {
      const rolls = rollDice(5, 6);
      expect(rolls).toHaveLength(5);
    });

    it('should return all values within valid range', () => {
      const rolls = rollDice(10, 8);
      for (const roll of rolls) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(8);
      }
    });

    it('should return array of integers', () => {
      const rolls = rollDice(5, 6);
      for (const roll of rolls) {
        expect(Number.isInteger(roll)).toBe(true);
      }
    });

    it('should handle single die', () => {
      const rolls = rollDice(1, 20);
      expect(rolls).toHaveLength(1);
      expect(rolls[0]).toBeGreaterThanOrEqual(1);
      expect(rolls[0]).toBeLessThanOrEqual(20);
    });
  });

  // =============================================================================
  // Handler Tests
  // =============================================================================
  describe('rollDiceHandler', () => {
    describe('valid rolls', () => {
      it('should roll d20 and return result', async () => {
        const result = await rollDiceHandler({ notation: 'd20' });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.notation).toBe('1d20');
        expect(content.rolls).toHaveLength(1);
        expect(content.rolls[0]).toBeGreaterThanOrEqual(1);
        expect(content.rolls[0]).toBeLessThanOrEqual(20);
        expect(content.modifier).toBe(0);
        expect(content.total).toBe(content.rolls[0]);
      });

      it('should roll 2d6 and return result', async () => {
        const result = await rollDiceHandler({ notation: '2d6' });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.notation).toBe('2d6');
        expect(content.rolls).toHaveLength(2);
        for (const roll of content.rolls) {
          expect(roll).toBeGreaterThanOrEqual(1);
          expect(roll).toBeLessThanOrEqual(6);
        }
        expect(content.total).toBe(content.rolls[0] + content.rolls[1]);
      });

      it('should apply positive modifier correctly', async () => {
        const result = await rollDiceHandler({ notation: '1d20+5' });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.notation).toBe('1d20+5');
        expect(content.modifier).toBe(5);
        expect(content.total).toBe(content.rolls[0] + 5);
      });

      it('should apply negative modifier correctly', async () => {
        const result = await rollDiceHandler({ notation: '3d8-2' });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.notation).toBe('3d8-2');
        expect(content.modifier).toBe(-2);
        const rollsSum = content.rolls.reduce((a: number, b: number) => a + b, 0);
        expect(content.total).toBe(rollsSum - 2);
      });

      it('should handle all valid die types', async () => {
        const dieTypes = [4, 6, 8, 10, 12, 20, 100];
        for (const sides of dieTypes) {
          const result = await rollDiceHandler({ notation: `d${sides}` });
          expect(result.isError).toBeFalsy();
          const content = JSON.parse(result.content[0].text);
          expect(content.rolls[0]).toBeGreaterThanOrEqual(1);
          expect(content.rolls[0]).toBeLessThanOrEqual(sides);
        }
      });

      it('should handle maximum dice count', async () => {
        const result = await rollDiceHandler({ notation: '100d6' });
        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.rolls).toHaveLength(100);
      });
    });

    describe('error handling', () => {
      it('should return error for invalid notation', async () => {
        const result = await rollDiceHandler({ notation: 'invalid' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid dice notation');
      });

      it('should return error for invalid die size', async () => {
        const result = await rollDiceHandler({ notation: 'd7' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid dice notation');
      });

      it('should return error for too many dice', async () => {
        const result = await rollDiceHandler({ notation: '101d6' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid dice notation');
      });

      it('should return error for missing input', async () => {
        const result = await rollDiceHandler({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid input');
      });

      it('should return error for invalid input type', async () => {
        const result = await rollDiceHandler({ notation: 123 });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid input');
      });

      it('should return error for zero dice', async () => {
        const result = await rollDiceHandler({ notation: '0d6' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Invalid dice notation');
      });
    });
  });

  // =============================================================================
  // Tool Definition Tests
  // =============================================================================
  describe('diceRollerTool', () => {
    it('should have correct name', () => {
      expect(diceRollerTool.name).toBe('roll_dice');
    });

    it('should have a title', () => {
      expect(diceRollerTool.title).toBe('Dice Roller');
    });

    it('should have a description', () => {
      expect(diceRollerTool.description).toBeTruthy();
      expect(diceRollerTool.description).toContain('dice');
    });

    it('should have input schema', () => {
      expect(diceRollerTool.inputSchema).toBeDefined();
      expect(diceRollerTool.inputSchema.type).toBe('object');
    });

    it('should have SEP-1303 annotations', () => {
      expect(diceRollerTool.annotations).toBeDefined();
      expect(diceRollerTool.annotations?.readOnlyHint).toBe(true);
      expect(diceRollerTool.annotations?.destructiveHint).toBe(false);
      expect(diceRollerTool.annotations?.idempotentHint).toBe(false); // Random!
      expect(diceRollerTool.annotations?.openWorldHint).toBe(false);
    });

    it('should have handler function', () => {
      expect(diceRollerTool.handler).toBeDefined();
      expect(typeof diceRollerTool.handler).toBe('function');
    });
  });

  // =============================================================================
  // Registration Tests
  // =============================================================================
  describe('registerDiceRollerTool', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistry();
    });

    it('should register dice roller tool', () => {
      expect(registry.getTool('roll_dice')).toBeUndefined();
      registerDiceRollerTool(registry);
      expect(registry.getTool('roll_dice')).toBeDefined();
    });

    it('should register with correct properties', () => {
      registerDiceRollerTool(registry);
      const tool = registry.getTool('roll_dice');
      expect(tool?.name).toBe('roll_dice');
      expect(tool?.annotations?.readOnlyHint).toBe(true);
      expect(tool?.annotations?.idempotentHint).toBe(false);
    });

    it('should be listable after registration', () => {
      registerDiceRollerTool(registry);
      const tools = registry.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0].name).toBe('roll_dice');
    });
  });

  // =============================================================================
  // Randomness Tests
  // =============================================================================
  describe('randomness', () => {
    it('should produce different results on multiple rolls', async () => {
      // Roll 20 times and check we get at least 2 different totals
      // (statistically almost certain with d20)
      const totals = new Set<number>();
      for (let i = 0; i < 20; i++) {
        const result = await rollDiceHandler({ notation: 'd20' });
        const content = JSON.parse(result.content[0].text);
        totals.add(content.total);
      }
      expect(totals.size).toBeGreaterThan(1);
    });

    it('should have statistical distribution (d6 rolls)', () => {
      // Roll 600 times and check all values 1-6 appear
      const counts = new Map<number, number>();
      for (let i = 0; i < 600; i++) {
        const roll = rollDie(6);
        counts.set(roll, (counts.get(roll) || 0) + 1);
      }
      // All values 1-6 should appear at least once
      for (let i = 1; i <= 6; i++) {
        expect(counts.get(i)).toBeGreaterThan(0);
      }
    });
  });
});
