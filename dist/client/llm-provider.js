/**
 * LLM Provider Factory
 *
 * Creates AI SDK language model instances.
 * Default: OpenRouter free tier (no API key required)
 * Optional: Anthropic Claude if ANTHROPIC_API_KEY is set
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.0-flash-exp:free';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-haiku-20240307';
/**
 * Create an LLM provider based on configuration and available API keys
 */
export function createLLMProvider(config = {}) {
    const anthropicKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    // If explicitly requesting Anthropic
    if (config.provider === 'anthropic') {
        if (!anthropicKey) {
            throw new Error('ANTHROPIC_API_KEY required for Anthropic provider');
        }
        return createAnthropicProvider(anthropicKey, config.model);
    }
    // If explicitly requesting OpenRouter or no preference
    if (config.provider === 'openrouter' || !config.provider) {
        const openrouter = createOpenRouter({
            apiKey: openrouterKey || '', // Empty string for free tier
        });
        const model = config.model || DEFAULT_OPENROUTER_MODEL;
        return openrouter(model);
    }
    throw new Error(`Unknown provider: ${config.provider}`);
}
/**
 * Create Anthropic provider (lazy import to avoid requiring the package)
 */
async function createAnthropicProviderAsync(apiKey, model) {
    try {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        const anthropic = createAnthropic({ apiKey });
        return anthropic(model || DEFAULT_ANTHROPIC_MODEL);
    }
    catch {
        throw new Error('Anthropic provider not available. Install @ai-sdk/anthropic package.');
    }
}
/**
 * Synchronous wrapper - throws if Anthropic not available
 */
function createAnthropicProvider(apiKey, model) {
    // For synchronous usage, we need to check if the package is available
    // This is a limitation - for proper async loading, use createLLMProviderAsync
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createAnthropic } = require('@ai-sdk/anthropic');
        const anthropic = createAnthropic({ apiKey });
        return anthropic(model || DEFAULT_ANTHROPIC_MODEL);
    }
    catch {
        throw new Error('Anthropic provider not available. Install @ai-sdk/anthropic package.');
    }
}
/**
 * Async version that properly handles dynamic imports
 */
export async function createLLMProviderAsync(config = {}) {
    const anthropicKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (config.provider === 'anthropic') {
        if (!anthropicKey) {
            throw new Error('ANTHROPIC_API_KEY required for Anthropic provider');
        }
        return createAnthropicProviderAsync(anthropicKey, config.model);
    }
    if (config.provider === 'openrouter' || !config.provider) {
        const openrouter = createOpenRouter({
            apiKey: openrouterKey || '',
        });
        const model = config.model || DEFAULT_OPENROUTER_MODEL;
        return openrouter(model);
    }
    throw new Error(`Unknown provider: ${config.provider}`);
}
/**
 * Get the default model ID for display
 */
export function getDefaultModelId(provider) {
    if (provider === 'anthropic') {
        return DEFAULT_ANTHROPIC_MODEL;
    }
    return DEFAULT_OPENROUTER_MODEL;
}
/**
 * Check which providers are available
 */
export function getAvailableProviders() {
    return {
        openrouter: true, // Always available (free tier)
        anthropic: !!process.env.ANTHROPIC_API_KEY,
    };
}
//# sourceMappingURL=llm-provider.js.map