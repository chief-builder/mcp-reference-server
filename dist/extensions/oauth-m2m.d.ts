/**
 * M2M OAuth extension implementation
 *
 * Extension name: anthropic/oauth-m2m
 * Provides OAuth 2.0 Machine-to-Machine authentication for MCP servers.
 *
 * Implements:
 * - Client Credentials Grant (RFC 6749 Section 4.4)
 * - client_secret_basic authentication (Base64 encoded in Authorization header)
 * - client_secret_post authentication (credentials in request body)
 * - Token caching until expiration
 * - Auth0 audience/resource parameter support
 *
 * Security:
 * - No client_secret logging
 * - Secure credential handling
 */
import { z } from 'zod';
import type { Extension } from './framework.js';
export declare const OAUTH_M2M_EXTENSION_NAME = "anthropic/oauth-m2m";
export declare const OAUTH_M2M_EXTENSION_VERSION = "1.0.0";
/** Supported client authentication methods */
export type ClientAuthMethod = 'client_secret_basic' | 'client_secret_post';
export declare const M2MClientConfigSchema: z.ZodObject<{
    /** OAuth token endpoint URL */
    tokenEndpoint: z.ZodString;
    /** OAuth client ID */
    clientId: z.ZodString;
    /** OAuth client secret */
    clientSecret: z.ZodString;
    /** Client authentication method */
    authMethod: z.ZodDefault<z.ZodEnum<["client_secret_basic", "client_secret_post"]>>;
    /** OAuth scopes to request */
    scopes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Audience parameter (Auth0-specific, also used for resource indicator) */
    audience: z.ZodOptional<z.ZodString>;
    /** Buffer time in seconds before expiry to trigger refresh */
    expiryBufferSeconds: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
    expiryBufferSeconds: number;
    authMethod: "client_secret_basic" | "client_secret_post";
    audience?: string | undefined;
    scopes?: string[] | undefined;
}, {
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
    audience?: string | undefined;
    scopes?: string[] | undefined;
    expiryBufferSeconds?: number | undefined;
    authMethod?: "client_secret_basic" | "client_secret_post" | undefined;
}>;
export declare const M2MTokenResponseSchema: z.ZodObject<{
    /** The access token */
    access_token: z.ZodString;
    /** Token type - always Bearer */
    token_type: z.ZodLiteral<"Bearer">;
    /** Token expiration in seconds */
    expires_in: z.ZodOptional<z.ZodNumber>;
    /** Granted scopes (space-separated) */
    scope: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    access_token: string;
    token_type: "Bearer";
    scope?: string | undefined;
    expires_in?: number | undefined;
}, {
    access_token: string;
    token_type: "Bearer";
    scope?: string | undefined;
    expires_in?: number | undefined;
}>;
export declare const M2MTokenErrorSchema: z.ZodObject<{
    error: z.ZodString;
    error_description: z.ZodOptional<z.ZodString>;
    error_uri: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    error: string;
    error_description?: string | undefined;
    error_uri?: string | undefined;
}, {
    error: string;
    error_description?: string | undefined;
    error_uri?: string | undefined;
}>;
export type M2MClientConfig = z.infer<typeof M2MClientConfigSchema>;
/** Raw token response from OAuth server */
export type M2MTokenResponse = z.infer<typeof M2MTokenResponseSchema>;
/** Normalized token response with camelCase */
export interface NormalizedM2MTokenResponse {
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn?: number | undefined;
    scope?: string | undefined;
}
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
    /** Client authentication method */
    authMethod?: ClientAuthMethod;
    /** OAuth scopes to request */
    scopes?: string[];
    /** Audience parameter (Auth0-specific) */
    audience?: string;
    /** Buffer time in seconds before expiry */
    expiryBufferSeconds?: number;
}
/**
 * Settings advertised in capabilities.experimental
 */
export interface OAuthM2MSettings {
    /** Supported grant types */
    grantTypes?: string[];
    /** Token endpoint (for client discovery) */
    tokenEndpoint?: string;
    /** Supported authentication methods */
    authMethods?: string[];
}
/**
 * M2M OAuth error
 */
export declare class M2MAuthError extends Error {
    readonly errorCode: string;
    readonly errorUri?: string | undefined;
    constructor(errorCode: string, message: string, errorUri?: string | undefined);
    static fromTokenError(response: z.infer<typeof M2MTokenErrorSchema>): M2MAuthError;
}
/**
 * OAuth 2.0 Machine-to-Machine client implementing client credentials flow.
 *
 * Features:
 * - Client credentials grant (RFC 6749 Section 4.4)
 * - Support for client_secret_basic and client_secret_post authentication
 * - Automatic token caching until expiration
 * - Auth0 audience parameter support
 * - No refresh tokens (per spec - get new token when expired)
 *
 * Security:
 * - Client secret is never logged
 * - Credentials are stored securely in memory
 */
export declare class M2MClient {
    private readonly config;
    private cachedToken;
    private readonly tokenRefresher;
    constructor(config: M2MClientConfig | OAuthM2MExtensionConfig);
    /**
     * Get the client configuration (without exposing the secret).
     */
    getConfig(): Omit<M2MClientConfig, 'clientSecret'>;
    /**
     * Get a valid access token, fetching a new one if necessary.
     *
     * This method:
     * 1. Returns cached token if still valid
     * 2. Fetches new token using client credentials if expired
     * 3. Deduplicates concurrent token requests
     *
     * @param options - Optional overrides for this request
     * @returns The access token string
     * @throws {M2MAuthError} If token request fails
     */
    getAccessToken(options?: {
        /** Override the configured scopes for this request */
        scopes?: string[];
        /** Override the configured audience for this request */
        audience?: string;
    }): Promise<string>;
    /**
     * Check if the cached token is still valid.
     *
     * @returns true if token exists and is not expired (considering buffer)
     */
    isTokenValid(): boolean;
    /**
     * Clear the cached token.
     * Useful when token is rejected or needs to be refreshed.
     */
    clearCache(): void;
    /**
     * Get token expiration time (if cached).
     *
     * @returns Expiration timestamp in milliseconds, or undefined if no token
     */
    getTokenExpiration(): number | undefined;
    /**
     * Fetch a new token and cache it.
     */
    private fetchAndCacheToken;
    /**
     * Request a new token from the token endpoint.
     */
    private requestToken;
    /**
     * Normalize token response from snake_case to camelCase.
     */
    private normalizeTokenResponse;
}
/**
 * Create an M2M client configured for Auth0.
 *
 * @param domain - Auth0 domain (e.g., 'your-tenant.auth0.com')
 * @param clientId - OAuth client ID
 * @param clientSecret - OAuth client secret
 * @param options - Additional options
 * @returns Configured M2M client
 */
export declare function createAuth0M2MClient(domain: string, clientId: string, clientSecret: string, options?: {
    /** API audience to request access for */
    audience?: string;
    /** Scopes to request */
    scopes?: string[];
    /** Authentication method (default: client_secret_post for Auth0) */
    authMethod?: ClientAuthMethod;
}): M2MClient;
/**
 * Create the anthropic/oauth-m2m extension.
 *
 * @param config OAuth M2M configuration
 * @returns Extension instance
 */
export declare function createOAuthM2MExtension(config: OAuthM2MExtensionConfig): Extension;
/**
 * Create a placeholder OAuth M2M extension without configuration.
 * Used for capability advertisement when actual config isn't available.
 *
 * @returns Extension instance with minimal settings
 */
export declare function createOAuthM2MPlaceholder(): Extension;
/**
 * Create an M2M client with custom configuration.
 *
 * @param config - Client configuration
 * @returns Configured M2M client
 */
export declare function createM2MClient(config: OAuthM2MExtensionConfig): M2MClient;
//# sourceMappingURL=oauth-m2m.d.ts.map