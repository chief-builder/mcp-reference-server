/**
 * LLM Provider Factory
 *
 * Creates AI SDK language model instances.
 * Default: OpenRouter free tier (no API key required)
 * Optional: Anthropic Claude if ANTHROPIC_API_KEY is set
 */
import type { LanguageModelV1 } from 'ai';
export interface LLMConfig {
    provider?: 'openrouter' | 'anthropic' | undefined;
    model?: string | undefined;
    apiKey?: string | undefined;
}
/**
 * Create an LLM provider based on configuration and available API keys
 */
export declare function createLLMProvider(config?: LLMConfig): LanguageModelV1;
/**
 * Async version that properly handles dynamic imports
 */
export declare function createLLMProviderAsync(config?: LLMConfig): Promise<LanguageModelV1>;
/**
 * Get the default model ID for display
 */
export declare function getDefaultModelId(provider?: 'openrouter' | 'anthropic'): string;
/**
 * Check which providers are available
 */
export declare function getAvailableProviders(): {
    openrouter: boolean;
    anthropic: boolean;
};
//# sourceMappingURL=llm-provider.d.ts.map