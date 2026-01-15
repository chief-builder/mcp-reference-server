/**
 * Dice roller tool - Example tool implementation
 */
import { z } from 'zod';
export const DiceRollerInputSchema = z.object({
    sides: z.number().int().min(1).max(100),
    count: z.number().int().min(1).max(100),
});
export async function rollDiceHandler(input) {
    const { sides, count } = input;
    const rolls = [];
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
export const diceRollerTool = {
    name: 'dice_roller',
    description: 'Roll dice with configurable number of sides and dice count',
    inputSchema: DiceRollerInputSchema,
    handler: rollDiceHandler,
};
//# sourceMappingURL=dice-roller.js.map