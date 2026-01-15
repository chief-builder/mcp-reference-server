/**
 * Fortune Teller Tool
 *
 * Generates random fortunes based on category and mood.
 * Implements SEP-1303 compliant annotations and auto-complete support.
 */

import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Tool, ToolRegistry, JsonSchema, ToolResult } from './registry.js';
import { createToolErrorResult, createToolSuccessResult } from '../protocol/errors.js';

// =============================================================================
// Constants
// =============================================================================

/** Valid fortune categories */
const CATEGORIES = ['love', 'career', 'health', 'wealth', 'general'] as const;
type Category = (typeof CATEGORIES)[number];

/** Valid mood options */
const MOODS = ['optimistic', 'mysterious', 'cautious'] as const;
type Mood = (typeof MOODS)[number];

/** Default mood when not specified */
const DEFAULT_MOOD: Mood = 'mysterious';

// =============================================================================
// Fortune Messages
// =============================================================================

type FortunesByMood = Record<Mood, string[]>;
type FortunePool = Record<Category, FortunesByMood>;

/**
 * Fortune messages organized by category and mood.
 * Each category has at least 5 fortunes per mood.
 */
const FORTUNES: FortunePool = {
  love: {
    optimistic: [
      'Your heart is about to find what it has been searching for.',
      'A beautiful connection awaits you in the near future.',
      'Love will bloom where you least expect it.',
      'Your romantic journey takes a wonderful turn soon.',
      'Someone special is thinking of you right now.',
    ],
    mysterious: [
      'The stars align for matters of the heart... in unexpected ways.',
      'A secret admirer watches from the shadows.',
      'Ancient forces conspire to bring two souls together.',
      'The moon whispers of love yet to be revealed.',
      "Destiny has woven your path with another's.",
    ],
    cautious: [
      'Take time to know your heart before offering it.',
      'Love requires patience; do not rush what needs to grow.',
      'Guard your heart while remaining open to possibility.',
      'Past lessons prepare you for future love.',
      'True connection comes to those who wait wisely.',
    ],
  },
  career: {
    optimistic: [
      'A promotion or new opportunity is on the horizon.',
      'Your hard work is about to be recognized.',
      'Success awaits your next bold move.',
      'Your skills will open unexpected doors.',
      'Financial growth follows your professional efforts.',
    ],
    mysterious: [
      'A stranger holds the key to your next chapter.',
      'The winds of change blow through your workplace.',
      'An unexpected message will alter your path.',
      'What seems like an ending is truly a beginning.',
      'The universe prepares a role you never imagined.',
    ],
    cautious: [
      'Think twice before signing any new agreements.',
      'Not all opportunities are as golden as they appear.',
      'Verify the intentions of those who offer help.',
      'Slow progress is still progress; do not abandon your path.',
      'Protect your ideas from those who might claim them.',
    ],
  },
  health: {
    optimistic: [
      'Your vitality grows stronger each day.',
      'Renewed energy awaits with the changing season.',
      'Your body is healing in ways you cannot yet see.',
      'A positive health breakthrough approaches.',
      'Balance and wellness are aligning in your favor.',
    ],
    mysterious: [
      'Your body holds wisdom that your mind has not yet heard.',
      'An ancient remedy may hold modern answers.',
      'The connection between mind and body reveals itself.',
      'Dreams carry messages about your wellbeing.',
      'Listen to the whispers of your physical form.',
    ],
    cautious: [
      'Rest more than you think you need to.',
      'Pay attention to small signals from your body.',
      'Prevention now saves much trouble later.',
      'Do not ignore what feels out of balance.',
      'Seek counsel before making dramatic changes.',
    ],
  },
  wealth: {
    optimistic: [
      'Prosperity flows toward you like a rising tide.',
      'An unexpected windfall brightens your near future.',
      'Your financial patience is about to pay off.',
      'Abundance manifests from your careful planning.',
      'A lucrative opportunity presents itself soon.',
    ],
    mysterious: [
      'Treasure hides in plain sight, awaiting discovery.',
      'The number seven holds significance for your fortune.',
      'What was lost shall find its way back to you.',
      'An old connection brings new financial possibility.',
      'The universe rewards those who trust its timing.',
    ],
    cautious: [
      'Save now for uncertainties ahead.',
      'Examine carefully before investing your resources.',
      'Not all that glitters leads to gold.',
      'A conservative approach protects your gains.',
      'Be wary of deals that seem too perfect.',
    ],
  },
  general: {
    optimistic: [
      'Today marks the beginning of wonderful things.',
      'Your positive energy attracts positive outcomes.',
      'The universe conspires in your favor.',
      'Happiness finds you in unexpected moments.',
      'Your optimism is your greatest asset.',
    ],
    mysterious: [
      'The veil between worlds grows thin for you.',
      'An old memory holds the answer you seek.',
      'Pay attention to recurring symbols in your life.',
      'Synchronicity is not coincidence but guidance.',
      'The answer comes when you stop seeking it.',
    ],
    cautious: [
      'Proceed thoughtfully in all your endeavors.',
      'Not everyone who smiles is a friend.',
      'Question what seems too easy.',
      'Patience protects what haste would harm.',
      'Trust your instincts when something feels wrong.',
    ],
  },
};

// =============================================================================
// Input Schema (Zod for internal validation)
// =============================================================================

export const FortuneTellerInputSchema = z.object({
  category: z.enum(CATEGORIES),
  mood: z.enum(MOODS).optional().default(DEFAULT_MOOD),
});

export type FortuneTellerInput = z.infer<typeof FortuneTellerInputSchema>;

// =============================================================================
// JSON Schema (for MCP tool definition)
// =============================================================================

export const fortuneTellerInputJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: [...CATEGORIES],
      description: 'The fortune category: love, career, health, wealth, or general',
    },
    mood: {
      type: 'string',
      enum: [...MOODS],
      description:
        'The tone of the fortune: optimistic (positive), mysterious (enigmatic), or cautious (warning). Defaults to mysterious.',
    },
  },
  required: ['category'],
  additionalProperties: false,
};

// =============================================================================
// Fortune Selection
// =============================================================================

/**
 * Select a random fortune from the pool for the given category and mood.
 *
 * @param category - The fortune category
 * @param mood - The fortune mood/tone
 * @returns A random fortune string
 */
export function selectFortune(category: Category, mood: Mood): string {
  const fortunes = FORTUNES[category][mood];
  const index = randomInt(0, fortunes.length);
  // Non-null assertion safe: FORTUNES is a complete pool with all category/mood combinations
  return fortunes[index]!;
}

// =============================================================================
// Auto-complete Support
// =============================================================================

/**
 * Get completion suggestions for fortune teller arguments.
 *
 * @param argName - The argument name (category or mood)
 * @param prefix - Optional prefix to filter suggestions
 * @returns Array of valid completion values
 */
export function getFortuneCompletions(argName: string, prefix: string = ''): string[] {
  const normalizedPrefix = prefix.toLowerCase();

  if (argName === 'category') {
    return CATEGORIES.filter((cat) => cat.startsWith(normalizedPrefix));
  }

  if (argName === 'mood') {
    return MOODS.filter((m) => m.startsWith(normalizedPrefix));
  }

  return [];
}

// =============================================================================
// Tool Handler
// =============================================================================

/**
 * Execute a fortune reading and return a SEP-1303 compliant ToolResult.
 */
export async function tellFortuneHandler(args: unknown): Promise<ToolResult> {
  // Validate input with Zod
  const parseResult = FortuneTellerInputSchema.safeParse(args);
  if (!parseResult.success) {
    const errors = parseResult.error.errors;

    // Check for specific validation errors
    for (const err of errors) {
      if (err.path[0] === 'category') {
        return createToolErrorResult(
          `Invalid category. Must be one of: ${CATEGORIES.join(', ')}`,
          'tell_fortune'
        );
      }
      if (err.path[0] === 'mood') {
        return createToolErrorResult(
          `Invalid mood. Must be one of: ${MOODS.join(', ')}`,
          'tell_fortune'
        );
      }
    }

    return createToolErrorResult(
      'Invalid input: ' + errors.map((e) => e.message).join(', '),
      'tell_fortune'
    );
  }

  const { category, mood } = parseResult.data;

  // Select a random fortune
  const fortune = selectFortune(category, mood);

  // Return successful result
  return createToolSuccessResult(
    JSON.stringify({
      category,
      mood,
      fortune,
    })
  );
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * Fortune teller tool definition with SEP-1303 annotations.
 */
export const fortuneTellerTool: Tool = {
  name: 'tell_fortune',
  title: 'Fortune Teller',
  description:
    'Reveal a fortune for the querent. Choose a category (love, career, health, wealth, general) and optionally a mood (optimistic, mysterious, cautious) to set the tone of the reading.',
  inputSchema: fortuneTellerInputJsonSchema,
  annotations: {
    readOnlyHint: true, // Does not modify any state
    destructiveHint: false, // Cannot delete or modify data
    idempotentHint: false, // Random output each time - NOT idempotent!
    openWorldHint: false, // No external services or APIs
  },
  handler: tellFortuneHandler,
};

// =============================================================================
// Registration Helper
// =============================================================================

/**
 * Register the fortune teller tool with a ToolRegistry.
 *
 * @param registry - The ToolRegistry to register with
 */
export function registerFortuneTellerTool(registry: ToolRegistry): void {
  registry.registerTool(fortuneTellerTool);
}
