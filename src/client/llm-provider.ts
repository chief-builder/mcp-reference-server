/**
 * LLM Provider Factory
 *
 * Creates AI SDK language model instances.
 * Default: OpenRouter free tier (no API key required)
 * Optional: Anthropic Claude if ANTHROPIC_API_KEY is set
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModelV1 } from 'ai';

export interface LLMConfig {
  provider?: 'openrouter' | 'anthropic' | undefined;
  model?: string | undefined;
  apiKey?: string | undefined;
}

const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.5-flash-lite';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-haiku-20240307';

/**
 * Create Anthropic provider (lazy import to avoid requiring the package)
 */
async function createAnthropicProviderAsync(
  apiKey: string,
  model?: string
): Promise<LanguageModelV1> {
  try {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    const anthropic = createAnthropic({ apiKey });
    return anthropic(model || DEFAULT_ANTHROPIC_MODEL);
  } catch {
    throw new Error(
      'Anthropic provider not available. Install @ai-sdk/anthropic package.'
    );
  }
}

/**
 * Create an LLM provider based on configuration and available API keys
 */
export async function createLLMProviderAsync(
  config: LLMConfig = {}
): Promise<LanguageModelV1> {
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
export function getDefaultModelId(provider?: 'openrouter' | 'anthropic'): string {
  if (provider === 'anthropic') {
    return DEFAULT_ANTHROPIC_MODEL;
  }
  return DEFAULT_OPENROUTER_MODEL;
}

/**
 * Check which providers are available
 */
export function getAvailableProviders(): {
  openrouter: boolean;
  anthropic: boolean;
} {
  return {
    openrouter: true, // Always available (free tier)
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };
}
