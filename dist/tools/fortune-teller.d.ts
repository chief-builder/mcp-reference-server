/**
 * Fortune teller tool - Example tool implementation
 */
import { z } from 'zod';
import type { ToolDefinition } from './registry.js';
export declare const FortuneTellerInputSchema: z.ZodObject<{
    category: z.ZodEnum<["general", "love", "career", "health"]>;
}, "strip", z.ZodTypeAny, {
    category: "general" | "love" | "career" | "health";
}, {
    category: "general" | "love" | "career" | "health";
}>;
export type FortuneTellerInput = z.infer<typeof FortuneTellerInputSchema>;
export interface FortuneTellerOutput {
    fortune: string;
    category: string;
    luckyNumber: number;
}
export declare function tellFortuneHandler(input: FortuneTellerInput): Promise<FortuneTellerOutput>;
export declare const fortuneTellerTool: ToolDefinition<FortuneTellerInput, FortuneTellerOutput>;
//# sourceMappingURL=fortune-teller.d.ts.map