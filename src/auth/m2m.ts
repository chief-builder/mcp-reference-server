/**
 * Machine-to-Machine (M2M) OAuth client
 *
 * Re-exports from the extensions module for backward compatibility.
 * The main implementation is in src/extensions/oauth-m2m.ts
 */

// Re-export types and classes from the extension module
export {
  M2MClient,
  M2MAuthError,
  createM2MClient,
  createAuth0M2MClient,
  type M2MClientConfig,
  type NormalizedM2MTokenResponse as M2MTokenResponse,
  type OAuthM2MExtensionConfig,
  type ClientAuthMethod,
} from '../extensions/oauth-m2m.js';
