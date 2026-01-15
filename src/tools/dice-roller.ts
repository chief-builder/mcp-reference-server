/**
 * Dice roller tool - Example tool implementation
 */

import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

export const DiceRollerInputSchema = z.object({
  sides: z.number().int().min(1).max(100),
  count: z.number().int().min(1).max(100),
});

export type DiceRollerInput = z.infer<typeof DiceRollerInputSchema>;

export interface DiceRollerOutput {
  rolls: number[];
  total: number;
  notation: string;
}

export async function rollDiceHandler(input: DiceRollerInput): Promise<DiceRollerOutput> {
  const { sides, count } = input;
  const rolls: number[] = [];

  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }

  const total = rolls.reduce((sum, roll) => sum + roll, 0);

  return {
    rolls,
    total,
    notation: `${count}d${sides}`,
  };
}

export const diceRollerTool: ToolDefinition<DiceRollerInput, DiceRollerOutput> = {
  name: 'dice_roller',
  description: 'Roll dice with configurable number of sides and dice count',
  inputSchema: DiceRollerInputSchema,
  handler: rollDiceHandler,
};
