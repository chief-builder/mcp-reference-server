/**
 * Dice Roller Tool
 *
 * Parses dice notation (e.g., 2d6, 1d20+5, 3d8-2), generates random rolls,
 * and calculates totals. Implements SEP-1303 compliant annotations.
 */
import { z } from 'zod';
import type { Tool, ToolRegistry, JsonSchema, ToolResult } from './registry.js';
/** Valid die sizes */
declare const VALID_SIDES: readonly [4, 6, 8, 10, 12, 20, 100];
type ValidSides = (typeof VALID_SIDES)[number];
export declare const DiceRollerInputSchema: z.ZodObject<{
    notation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    notation: string;
}, {
    notation: string;
}>;
export type DiceRollerInput = z.infer<typeof DiceRollerInputSchema>;
export declare const diceRollerInputJsonSchema: JsonSchema;
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
export declare function parseDiceNotation(notation: string): ParsedDiceNotation | null;
/**
 * Roll a single die using cryptographically secure random.
 *
 * @param sides - Number of sides on the die
 * @returns Random roll result (1 to sides, inclusive)
 */
export declare function rollDie(sides: number): number;
/**
 * Roll multiple dice and return individual results.
 *
 * @param count - Number of dice to roll
 * @param sides - Number of sides per die
 * @returns Array of roll results
 */
export declare function rollDice(count: number, sides: number): number[];
/**
 * Execute a dice roll and return a SEP-1303 compliant ToolResult.
 */
export declare function rollDiceHandler(args: unknown): Promise<ToolResult>;
/**
 * Dice roller tool definition with SEP-1303 annotations.
 */
export declare const diceRollerTool: Tool;
/**
 * Register the dice roller tool with a ToolRegistry.
 *
 * @param registry - The ToolRegistry to register with
 */
export declare function registerDiceRollerTool(registry: ToolRegistry): void;
export {};
//# sourceMappingURL=dice-roller.d.ts.map