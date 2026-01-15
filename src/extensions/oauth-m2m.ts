/**
 * M2M OAuth extension implementation
 *
 * Extension name: anthropic/oauth-m2m
 * Provides OAuth 2.0 Machine-to-Machine authentication for MCP servers.
 */

import type { Extension } from './framework.js';

// =============================================================================
// Constants
// =============================================================================

export const OAUTH_M2M_EXTENSION_NAME = 'anthropic/oauth-m2m';
export const OAUTH_M2M_EXTENSION_VERSION = '1.0.0';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for the OAuth M2M extension
 */
export interface OAuthM2MExtensionConfig {
  /** OAuth token endpoint URL */
  tokenEndpoint: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** OAuth scopes to request */
  scopes?: string[];
}

/**
 * Settings advertised in capabilities.experimental
 */
export interface OAuthM2MSettings {
  /** Supported grant types */
  grantTypes?: string[];
  /** Token endpoint (for client discovery) */
  tokenEndpoint?: string;
}

// =============================================================================
// Extension Factory
// =============================================================================

/**
 * Create the anthropic/oauth-m2m extension.
 *
 * @param config OAuth M2M configuration
 * @returns Extension instance
 */
export function createOAuthM2MExtension(config: OAuthM2MExtensionConfig): Extension {
  // Settings to advertise to clients
  const settings: Record<string, unknown> = {
    grantTypes: ['client_credentials'],
    tokenEndpoint: config.tokenEndpoint,
  };

  return {
    name: OAUTH_M2M_EXTENSION_NAME,
    version: OAUTH_M2M_EXTENSION_VERSION,
    description: 'OAuth 2.0 Machine-to-Machine authentication extension',
    settings,

    async onInitialize(_clientSettings: unknown): Promise<void> {
      // TODO: Validate configuration and pre-fetch token
      // Implementation will be added in c6t.24
    },

    async onShutdown(): Promise<void> {
      // TODO: Cleanup any cached tokens
      // Implementation will be added in c6t.24
    },
  };
}

/**
 * Create a placeholder OAuth M2M extension without configuration.
 * Used for capability advertisement when actual config isn't available.
 *
 * @returns Extension instance with minimal settings
 */
export function createOAuthM2MPlaceholder(): Extension {
  return {
    name: OAUTH_M2M_EXTENSION_NAME,
    version: OAUTH_M2M_EXTENSION_VERSION,
    description: 'OAuth 2.0 Machine-to-Machine authentication extension',
    settings: {
      grantTypes: ['client_credentials'],
    },

    async onInitialize(_clientSettings: unknown): Promise<void> {
      // Placeholder - no-op
    },

    async onShutdown(): Promise<void> {
      // Placeholder - no-op
    },
  };
}
