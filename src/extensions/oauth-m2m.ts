/**
 * M2M OAuth extension implementation
 */

import type { Extension } from './framework.js';

export const OAUTH_M2M_EXTENSION_NAME = 'oauth-m2m';
export const OAUTH_M2M_EXTENSION_VERSION = '1.0.0';

export interface OAuthM2MExtensionConfig {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
}

export function createOAuthM2MExtension(_config: OAuthM2MExtensionConfig): Extension {
  return {
    name: OAUTH_M2M_EXTENSION_NAME,
    version: OAUTH_M2M_EXTENSION_VERSION,

    async initialize() {
      // TODO: Validate configuration and pre-fetch token
    },

    async shutdown() {
      // TODO: Cleanup any cached tokens
    },
  };
}
