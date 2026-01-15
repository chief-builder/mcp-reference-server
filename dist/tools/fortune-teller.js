/**
 * Fortune teller tool - Example tool implementation
 */
import { z } from 'zod';
export const FortuneTellerInputSchema = z.object({
    category: z.enum(['general', 'love', 'career', 'health']),
});
const fortunes = {
    general: [
        'A pleasant surprise is waiting for you.',
        'Good things come to those who wait.',
        'Your hard work will soon pay off.',
        'An unexpected opportunity will arise.',
    ],
    love: [
        'Romance is on the horizon.',
        'A meaningful connection awaits.',
        'Open your heart to new possibilities.',
    ],
    career: [
        'A new professional opportunity approaches.',
        'Your skills will be recognized soon.',
        'Collaboration will lead to success.',
    ],
    health: [
        'Focus on balance in all things.',
        'A healthy mind leads to a healthy body.',
        'Rest and recovery bring strength.',
    ],
};
export async function tellFortuneHandler(input) {
    const category = input.category;
    const categoryFortunes = fortunes[category] ?? fortunes['general'];
    const fortune = categoryFortunes[Math.floor(Math.random() * categoryFortunes.length)];
    const luckyNumber = Math.floor(Math.random() * 100) + 1;
    return {
        fortune,
        category,
        luckyNumber,
    };
}
export const fortuneTellerTool = {
    name: 'fortune_teller',
    description: 'Get a fortune prediction with optional category',
    inputSchema: FortuneTellerInputSchema,
    handler: tellFortuneHandler,
};
//# sourceMappingURL=fortune-teller.js.map