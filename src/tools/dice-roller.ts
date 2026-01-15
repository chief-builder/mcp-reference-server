/**
 * Dice Roller Tool
 *
 * Parses dice notation (e.g., 2d6, 1d20+5, 3d8-2), generates random rolls,
 * and calculates totals. Implements SEP-1303 compliant annotations.
 */

import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Tool, ToolRegistry, JsonSchema, ToolResult } from './registry.js';
import { createToolErrorResult, createToolSuccessResult } from '../protocol/errors.js';

// =============================================================================
// Constants
// =============================================================================

/** Valid die sizes */
const VALID_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
type ValidSides = (typeof VALID_SIDES)[number];

/** Maximum number of dice allowed in a single roll */
const MAX_DICE = 100;

// =============================================================================
// Input Schema (Zod for internal validation)
// =============================================================================

export const DiceRollerInputSchema = z.object({
  notation: z.string().min(1, 'Notation is required'),
});

export type DiceRollerInput = z.infer<typeof DiceRollerInputSchema>;

// =============================================================================
// JSON Schema (for MCP tool definition)
// =============================================================================

export const diceRollerInputJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    notation: {
      type: 'string',
      description:
        'Dice notation in NdS[+/-M] format. N = number of dice (optional, default 1), d = literal "d", S = sides (4, 6, 8, 10, 12, 20, 100), +/-M = optional modifier. Examples: d20, 2d6, 1d20+5, 3d8-2',
    },
  },
  required: ['notation'],
  additionalProperties: false,
};

// =============================================================================
// Dice Notation Parser
// =============================================================================

interface ParsedDiceNotation {
  count: number;
  sides: ValidSides;
  modifier: number;
}

/**
 * Parse dice notation string into components.
 * Format: NdS[+/-M] where:
 * - N = number of dice (optional, default 1)
 * - d = literal 'd'
 * - S = sides per die (4, 6, 8, 10, 12, 20, 100)
 * - +/-M = optional modifier
 *
 * @param notation - Dice notation string (e.g., "2d6", "1d20+5", "d8-2")
 * @returns Parsed notation object or null if invalid
 */
export function parseDiceNotation(notation: string): ParsedDiceNotation | null {
  // Normalize input: trim whitespace and convert to lowercase
  const normalized = notation.trim().toLowerCase();

  // Regex: optional count, 'd', sides, optional modifier
  // Examples: d20, 2d6, 1d20+5, 3d8-2, 4d6
  const regex = /^(\d*)d(\d+)([+-]\d+)?$/;
  const match = normalized.match(regex);

  if (!match) {
    return null;
  }

  const [, countStr, sidesStr, modifierStr] = match;

  // Ensure we have the required capture groups
  if (sidesStr === undefined) {
    return null;
  }

  // Parse count (default to 1 if not specified)
  const count = countStr === '' || countStr === undefined ? 1 : parseInt(countStr, 10);

  // Parse sides
  const sides = parseInt(sidesStr, 10);

  // Parse modifier (default to 0 if not specified)
  const modifier = modifierStr ? parseInt(modifierStr, 10) : 0;

  // Validate count
  if (count < 1 || count > MAX_DICE) {
    return null;
  }

  // Validate sides against allowed values
  if (!VALID_SIDES.includes(sides as ValidSides)) {
    return null;
  }

  return {
    count,
    sides: sides as ValidSides,
    modifier,
  };
}

// =============================================================================
// Roll Generator
// =============================================================================

/**
 * Roll a single die using cryptographically secure random.
 *
 * @param sides - Number of sides on the die
 * @returns Random roll result (1 to sides, inclusive)
 */
export function rollDie(sides: number): number {
  // crypto.randomInt(min, max) returns a random integer in [min, max)
  // So for 1-6, we use randomInt(1, 7)
  return randomInt(1, sides + 1);
}

/**
 * Roll multiple dice and return individual results.
 *
 * @param count - Number of dice to roll
 * @param sides - Number of sides per die
 * @returns Array of roll results
 */
export function rollDice(count: number, sides: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }
  return rolls;
}

// =============================================================================
// Tool Handler
// =============================================================================

/**
 * Execute a dice roll and return a SEP-1303 compliant ToolResult.
 */
export async function rollDiceHandler(args: unknown): Promise<ToolResult> {
  // Validate input with Zod
  const parseResult = DiceRollerInputSchema.safeParse(args);
  if (!parseResult.success) {
    return createToolErrorResult(
      'Invalid input: ' + parseResult.error.errors.map((e) => e.message).join(', '),
      'roll_dice'
    );
  }

  const { notation } = parseResult.data;

  // Parse the dice notation
  const parsed = parseDiceNotation(notation);
  if (!parsed) {
    return createToolErrorResult(
      `Invalid dice notation: "${notation}". ` +
        `Expected format: NdS[+/-M] where N is number of dice (1-${MAX_DICE}), ` +
        `S is sides (${VALID_SIDES.join(', ')}), and +/-M is optional modifier. ` +
        'Examples: d20, 2d6, 1d20+5, 3d8-2',
      'roll_dice'
    );
  }

  // Roll the dice
  const rolls = rollDice(parsed.count, parsed.sides);
  const rollsSum = rolls.reduce((a, b) => a + b, 0);
  const total = rollsSum + parsed.modifier;

  // Build expression string
  let expression = `${parsed.count}d${parsed.sides}`;
  if (parsed.modifier > 0) {
    expression += `+${parsed.modifier}`;
  } else if (parsed.modifier < 0) {
    expression += `${parsed.modifier}`;
  }

  // Return successful result
  return createToolSuccessResult(
    JSON.stringify({
      notation: expression,
      rolls,
      modifier: parsed.modifier,
      total,
    })
  );
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * Dice roller tool definition with SEP-1303 annotations.
 */
export const diceRollerTool: Tool = {
  name: 'roll_dice',
  title: 'Dice Roller',
  description:
    'Roll dice using standard tabletop notation. Supports common die types (d4, d6, d8, d10, d12, d20, d100) with optional modifiers. Returns individual roll results and total.',
  inputSchema: diceRollerInputJsonSchema,
  annotations: {
    readOnlyHint: true, // Does not modify any state
    destructiveHint: false, // Cannot delete or modify data
    idempotentHint: false, // Random output each time - NOT idempotent!
    openWorldHint: false, // No external services or APIs
  },
  handler: rollDiceHandler,
};

// =============================================================================
// Registration Helper
// =============================================================================

/**
 * Register the dice roller tool with a ToolRegistry.
 *
 * @param registry - The ToolRegistry to register with
 */
export function registerDiceRollerTool(registry: ToolRegistry): void {
  registry.registerTool(diceRollerTool);
}
