/**
 * Fortune Teller Tool
 *
 * Generates random fortunes based on category and mood.
 * Implements SEP-1303 compliant annotations and auto-complete support.
 */
import { z } from 'zod';
import type { Tool, ToolRegistry, JsonSchema, ToolResult } from './registry.js';
/** Valid fortune categories */
declare const CATEGORIES: readonly ["love", "career", "health", "wealth", "general"];
type Category = (typeof CATEGORIES)[number];
/** Valid mood options */
declare const MOODS: readonly ["optimistic", "mysterious", "cautious"];
type Mood = (typeof MOODS)[number];
export declare const FortuneTellerInputSchema: z.ZodObject<{
    category: z.ZodEnum<["love", "career", "health", "wealth", "general"]>;
    mood: z.ZodDefault<z.ZodOptional<z.ZodEnum<["optimistic", "mysterious", "cautious"]>>>;
}, "strip", z.ZodTypeAny, {
    category: "love" | "career" | "health" | "wealth" | "general";
    mood: "optimistic" | "mysterious" | "cautious";
}, {
    category: "love" | "career" | "health" | "wealth" | "general";
    mood?: "optimistic" | "mysterious" | "cautious" | undefined;
}>;
export type FortuneTellerInput = z.infer<typeof FortuneTellerInputSchema>;
export declare const fortuneTellerInputJsonSchema: JsonSchema;
/**
 * Select a random fortune from the pool for the given category and mood.
 *
 * @param category - The fortune category
 * @param mood - The fortune mood/tone
 * @returns A random fortune string
 */
export declare function selectFortune(category: Category, mood: Mood): string;
/**
 * Get completion suggestions for fortune teller arguments.
 *
 * @param argName - The argument name (category or mood)
 * @param prefix - Optional prefix to filter suggestions
 * @returns Array of valid completion values
 */
export declare function getFortuneCompletions(argName: string, prefix?: string): string[];
/**
 * Execute a fortune reading and return a SEP-1303 compliant ToolResult.
 */
export declare function tellFortuneHandler(args: unknown): Promise<ToolResult>;
/**
 * Fortune teller tool definition with SEP-1303 annotations.
 */
export declare const fortuneTellerTool: Tool;
/**
 * Register the fortune teller tool with a ToolRegistry.
 *
 * @param registry - The ToolRegistry to register with
 */
export declare function registerFortuneTellerTool(registry: ToolRegistry): void;
export {};
//# sourceMappingURL=fortune-teller.d.ts.map