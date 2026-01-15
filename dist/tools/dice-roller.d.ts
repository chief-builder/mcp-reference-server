/**
 * Dice roller tool - Example tool implementation
 */
import { z } from 'zod';
import type { ToolDefinition } from './registry.js';
export declare const DiceRollerInputSchema: z.ZodObject<{
    sides: z.ZodNumber;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    sides: number;
    count: number;
}, {
    sides: number;
    count: number;
}>;
export type DiceRollerInput = z.infer<typeof DiceRollerInputSchema>;
export interface DiceRollerOutput {
    rolls: number[];
    total: number;
    notation: string;
}
export declare function rollDiceHandler(input: DiceRollerInput): Promise<DiceRollerOutput>;
export declare const diceRollerTool: ToolDefinition<DiceRollerInput, DiceRollerOutput>;
//# sourceMappingURL=dice-roller.d.ts.map