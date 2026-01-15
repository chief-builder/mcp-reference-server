/**
 * Fortune teller tool - Example tool implementation
 */

import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

export const FortuneTellerInputSchema = z.object({
  category: z.enum(['general', 'love', 'career', 'health']),
});

export type FortuneTellerInput = z.infer<typeof FortuneTellerInputSchema>;

export interface FortuneTellerOutput {
  fortune: string;
  category: string;
  luckyNumber: number;
}

const fortunes: Record<string, string[]> = {
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

export async function tellFortuneHandler(input: FortuneTellerInput): Promise<FortuneTellerOutput> {
  const category = input.category;
  const categoryFortunes = fortunes[category] ?? fortunes['general']!;
  const fortune = categoryFortunes[Math.floor(Math.random() * categoryFortunes.length)]!;
  const luckyNumber = Math.floor(Math.random() * 100) + 1;

  return {
    fortune,
    category,
    luckyNumber,
  };
}

export const fortuneTellerTool: ToolDefinition<FortuneTellerInput, FortuneTellerOutput> = {
  name: 'fortune_teller',
  description: 'Get a fortune prediction with optional category',
  inputSchema: FortuneTellerInputSchema,
  handler: tellFortuneHandler,
};
