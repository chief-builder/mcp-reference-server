/**
 * M2M OAuth extension implementation
 */
import type { Extension } from './framework.js';
export declare const OAUTH_M2M_EXTENSION_NAME = "oauth-m2m";
export declare const OAUTH_M2M_EXTENSION_VERSION = "1.0.0";
export interface OAuthM2MExtensionConfig {
    tokenEndpoint: string;
    clientId: string;
    clientSecret: string;
    scopes?: string[];
}
export declare function createOAuthM2MExtension(_config: OAuthM2MExtensionConfig): Extension;
//# sourceMappingURL=oauth-m2m.d.ts.map