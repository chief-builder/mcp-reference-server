/**
 * Token validation and refresh management
 *
 * Implements:
 * - Secure in-memory token storage (by resource indicator)
 * - Token expiration validation with buffer time
 * - JWT structure validation for format checking
 * - Token introspection (RFC 7662) for opaque tokens
 * - Automatic token refresh with rotation support
 * - Integration with OAuthClient for refresh operations
 */
import { z } from 'zod';
import { JWTPayload } from 'jose';
import { OAuthClient, NormalizedTokenResponse } from './oauth.js';
export declare const TokenPayloadSchema: z.ZodObject<{
    /** Subject identifier */
    sub: z.ZodString;
    /** Issuer identifier */
    iss: z.ZodString;
    /** Audience (can be string or array) */
    aud: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    /** Expiration timestamp (seconds since epoch) */
    exp: z.ZodNumber;
    /** Issued at timestamp (seconds since epoch) */
    iat: z.ZodNumber;
    /** Scopes (space-separated or array) */
    scope: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    /** Subject identifier */
    sub: z.ZodString;
    /** Issuer identifier */
    iss: z.ZodString;
    /** Audience (can be string or array) */
    aud: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    /** Expiration timestamp (seconds since epoch) */
    exp: z.ZodNumber;
    /** Issued at timestamp (seconds since epoch) */
    iat: z.ZodNumber;
    /** Scopes (space-separated or array) */
    scope: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    /** Subject identifier */
    sub: z.ZodString;
    /** Issuer identifier */
    iss: z.ZodString;
    /** Audience (can be string or array) */
    aud: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    /** Expiration timestamp (seconds since epoch) */
    exp: z.ZodNumber;
    /** Issued at timestamp (seconds since epoch) */
    iat: z.ZodNumber;
    /** Scopes (space-separated or array) */
    scope: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
}, z.ZodTypeAny, "passthrough">>;
export declare const TokenValidationOptionsSchema: z.ZodObject<{
    /** Expected issuer */
    issuer: z.ZodString;
    /** Expected audience (can be string or array) */
    audience: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    /** Clock tolerance in seconds (default: 0) */
    clockTolerance: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    audience: string | string[];
    issuer: string;
    clockTolerance: number;
}, {
    audience: string | string[];
    issuer: string;
    clockTolerance?: number | undefined;
}>;
export declare const IntrospectionResponseSchema: z.ZodObject<{
    /** Whether the token is active */
    active: z.ZodBoolean;
    /** Token scope */
    scope: z.ZodOptional<z.ZodString>;
    /** Client ID */
    client_id: z.ZodOptional<z.ZodString>;
    /** Username */
    username: z.ZodOptional<z.ZodString>;
    /** Token type */
    token_type: z.ZodOptional<z.ZodString>;
    /** Expiration timestamp */
    exp: z.ZodOptional<z.ZodNumber>;
    /** Issued at timestamp */
    iat: z.ZodOptional<z.ZodNumber>;
    /** Not before timestamp */
    nbf: z.ZodOptional<z.ZodNumber>;
    /** Subject */
    sub: z.ZodOptional<z.ZodString>;
    /** Audience */
    aud: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    /** Issuer */
    iss: z.ZodOptional<z.ZodString>;
    /** JWT ID */
    jti: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    /** Whether the token is active */
    active: z.ZodBoolean;
    /** Token scope */
    scope: z.ZodOptional<z.ZodString>;
    /** Client ID */
    client_id: z.ZodOptional<z.ZodString>;
    /** Username */
    username: z.ZodOptional<z.ZodString>;
    /** Token type */
    token_type: z.ZodOptional<z.ZodString>;
    /** Expiration timestamp */
    exp: z.ZodOptional<z.ZodNumber>;
    /** Issued at timestamp */
    iat: z.ZodOptional<z.ZodNumber>;
    /** Not before timestamp */
    nbf: z.ZodOptional<z.ZodNumber>;
    /** Subject */
    sub: z.ZodOptional<z.ZodString>;
    /** Audience */
    aud: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    /** Issuer */
    iss: z.ZodOptional<z.ZodString>;
    /** JWT ID */
    jti: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    /** Whether the token is active */
    active: z.ZodBoolean;
    /** Token scope */
    scope: z.ZodOptional<z.ZodString>;
    /** Client ID */
    client_id: z.ZodOptional<z.ZodString>;
    /** Username */
    username: z.ZodOptional<z.ZodString>;
    /** Token type */
    token_type: z.ZodOptional<z.ZodString>;
    /** Expiration timestamp */
    exp: z.ZodOptional<z.ZodNumber>;
    /** Issued at timestamp */
    iat: z.ZodOptional<z.ZodNumber>;
    /** Not before timestamp */
    nbf: z.ZodOptional<z.ZodNumber>;
    /** Subject */
    sub: z.ZodOptional<z.ZodString>;
    /** Audience */
    aud: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    /** Issuer */
    iss: z.ZodOptional<z.ZodString>;
    /** JWT ID */
    jti: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export declare const TokenManagerConfigSchema: z.ZodObject<{
    /** Buffer time in seconds before expiry to consider token expired */
    expiryBufferSeconds: z.ZodDefault<z.ZodNumber>;
    /** Token introspection endpoint URL (RFC 7662) */
    introspectionEndpoint: z.ZodOptional<z.ZodString>;
    /** Client ID for introspection requests */
    clientId: z.ZodOptional<z.ZodString>;
    /** Client secret for introspection requests */
    clientSecret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    expiryBufferSeconds: number;
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    introspectionEndpoint?: string | undefined;
}, {
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    expiryBufferSeconds?: number | undefined;
    introspectionEndpoint?: string | undefined;
}>;
export type TokenPayload = z.infer<typeof TokenPayloadSchema>;
export type TokenValidationOptions = z.infer<typeof TokenValidationOptionsSchema>;
export type IntrospectionResponse = z.infer<typeof IntrospectionResponseSchema>;
export type TokenManagerConfig = z.infer<typeof TokenManagerConfigSchema>;
/** Stored token entry with metadata */
export interface StoredToken {
    /** The access token value */
    accessToken: string;
    /** Token type (e.g., Bearer) */
    tokenType: string;
    /** Expiration timestamp in milliseconds */
    expiresAt: number;
    /** Refresh token for obtaining new access tokens */
    refreshToken?: string | undefined;
    /** Granted scopes */
    scope?: string | undefined;
    /** ID token (if openid scope was requested) */
    idToken?: string | undefined;
    /** Resource indicator this token is for */
    resource?: string | undefined;
    /** Timestamp when token was stored */
    storedAt: number;
}
/** Token refresh result */
export interface TokenRefreshResult {
    /** Whether the refresh was successful */
    success: boolean;
    /** The new token (if successful) */
    token?: StoredToken | undefined;
    /** Error message (if failed) */
    error?: string | undefined;
}
/** Options for JWT signature verification */
export interface JwtVerifyOptions {
    /** JWKS URI to fetch public keys from */
    jwksUri: string;
    /** Expected issuer claim */
    issuer?: string;
    /** Expected audience claim */
    audience?: string;
}
/**
 * Token-specific error
 */
export declare class TokenError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/**
 * Token expired error
 */
export declare class TokenExpiredError extends TokenError {
    constructor(message?: string);
}
/**
 * Token validation error
 */
export declare class TokenValidationError extends TokenError {
    constructor(message?: string);
}
/**
 * Token refresh error
 */
export declare class TokenRefreshError extends TokenError {
    constructor(message?: string);
}
/**
 * JWT signature verification error
 */
export declare class JwtSignatureError extends TokenError {
    constructor(message?: string);
}
/**
 * Generic token refresher with promise-lock pattern.
 *
 * Prevents concurrent token refresh requests by returning the same promise
 * for all callers while a refresh is in progress. This avoids duplicate
 * network calls and race conditions when multiple parts of the application
 * need a fresh token simultaneously.
 *
 * @typeParam T - The type of the refresh result
 *
 * @example
 * ```typescript
 * const refresher = new TokenRefresher<TokenResponse>();
 *
 * // Multiple concurrent calls will only trigger one actual refresh
 * const [token1, token2] = await Promise.all([
 *   refresher.refresh(() => fetchNewToken()),
 *   refresher.refresh(() => fetchNewToken()),
 * ]);
 * // token1 === token2 (same promise result)
 * ```
 */
export declare class TokenRefresher<T> {
    private refreshPromise;
    /**
     * Execute a refresh operation with deduplication.
     *
     * If a refresh is already in progress, returns the existing promise.
     * Otherwise, starts a new refresh and stores the promise for deduplication.
     * The promise is cleared after completion (success or failure).
     *
     * @param refreshFn - Function that performs the actual refresh
     * @returns The result of the refresh operation
     */
    refresh(refreshFn: () => Promise<T>): Promise<T>;
    /**
     * Check if a refresh is currently in progress.
     *
     * @returns true if a refresh operation is pending
     */
    isRefreshing(): boolean;
    /**
     * Clear any pending refresh promise.
     *
     * This is useful when cleaning up resources or resetting state.
     * Note: This does NOT cancel the underlying refresh operation.
     */
    clear(): void;
}
/**
 * Manages OAuth tokens with secure in-memory storage.
 *
 * Features:
 * - Secure in-memory storage (no persistence, no logging of values)
 * - Support for multiple resource tokens (by resource indicator)
 * - Token expiration tracking with configurable buffer time
 * - Automatic token refresh before expiration
 * - Refresh token rotation support
 * - Token introspection (RFC 7662) for opaque tokens
 */
export declare class TokenManager {
    private readonly config;
    private readonly oauthClient;
    private readonly tokens;
    private readonly refreshers;
    constructor(options?: {
        /** Token manager configuration */
        config?: Partial<TokenManagerConfig>;
        /** OAuth client for refresh operations */
        oauthClient?: OAuthClient;
    });
    /**
     * Store a token from a token response.
     *
     * @param response - The normalized token response
     * @param resource - Optional resource indicator for this token
     * @returns The stored token entry
     */
    storeToken(response: NormalizedTokenResponse, resource?: string): StoredToken;
    /**
     * Get a stored token for a resource.
     *
     * @param resource - Optional resource indicator
     * @returns The stored token or undefined
     */
    getToken(resource?: string): StoredToken | undefined;
    /**
     * Get a valid access token, refreshing if necessary.
     *
     * This method will automatically refresh the token if it's expired
     * or about to expire (within the buffer time).
     *
     * @param resource - Optional resource indicator
     * @returns The access token string
     * @throws {TokenError} If no token is available or refresh fails
     */
    getValidAccessToken(resource?: string): Promise<string>;
    /**
     * Check if a stored token is expired (with buffer time).
     *
     * @param token - The stored token to check
     * @returns true if expired or about to expire
     */
    isTokenExpired(token: StoredToken): boolean;
    /**
     * Check if a token payload is expired.
     *
     * @param payload - The decoded token payload
     * @param toleranceSeconds - Clock tolerance in seconds
     * @returns true if expired
     */
    isPayloadExpired(payload: TokenPayload, toleranceSeconds?: number): boolean;
    /**
     * Refresh a token using the OAuth client.
     *
     * @param resource - Optional resource indicator
     * @returns The refresh result
     */
    refresh(resource?: string): Promise<TokenRefreshResult>;
    /**
     * Remove a token from storage.
     *
     * @param resource - Optional resource indicator
     * @returns true if a token was removed
     */
    removeToken(resource?: string): boolean;
    /**
     * Clear all stored tokens.
     */
    clear(): void;
    /**
     * Get all stored resource keys.
     *
     * @returns Array of resource keys (excluding default)
     */
    getStoredResources(): string[];
    /**
     * Check if any tokens are stored.
     *
     * @returns true if at least one token is stored
     */
    hasTokens(): boolean;
    /**
     * Validate a JWT token format and optionally verify claims.
     *
     * WARNING: This method does NOT verify the cryptographic signature of the JWT.
     * It only validates the structure and claims. For production use where security
     * is critical, use the standalone `verifyJwt()` function which performs full
     * signature verification using JWKS.
     *
     * @param token - The JWT token string
     * @param options - Validation options
     * @returns The decoded payload
     * @throws {TokenValidationError} If validation fails
     */
    validateJwtFormat(token: string, options?: TokenValidationOptions): TokenPayload;
    /**
     * Introspect a token using RFC 7662 token introspection.
     *
     * @param token - The token to introspect
     * @param tokenTypeHint - Optional hint about the token type
     * @returns The introspection response
     * @throws {TokenError} If introspection is not configured or fails
     */
    introspect(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<IntrospectionResponse>;
    /**
     * Validate a token using introspection (for opaque tokens).
     *
     * @param token - The token to validate
     * @returns true if the token is active
     */
    validateWithIntrospection(token: string): Promise<boolean>;
    /**
     * Get the storage key for a resource.
     */
    private getResourceKey;
    /**
     * Refresh a token if possible, with deduplication using TokenRefresher.
     */
    private refreshTokenIfPossible;
    /**
     * Perform the actual token refresh.
     */
    private performRefresh;
}
/**
 * Check if a token payload is expired.
 *
 * @param payload - The decoded token payload
 * @param toleranceSeconds - Clock tolerance in seconds
 * @returns true if expired
 */
export declare function isTokenExpired(payload: TokenPayload, toleranceSeconds?: number): boolean;
/**
 * Validate an access token (JWT format).
 *
 * @param token - The token string
 * @param options - Validation options
 * @returns The decoded payload
 * @throws {TokenValidationError} If validation fails
 */
export declare function validateAccessToken(token: string, options: TokenValidationOptions): Promise<TokenPayload>;
/**
 * Refresh an access token.
 *
 * @param refreshToken - The refresh token
 * @param tokenEndpoint - The token endpoint URL
 * @param clientId - Optional client ID
 * @param clientSecret - Optional client secret
 * @returns The new tokens
 * @throws {TokenRefreshError} If refresh fails
 */
export declare function refreshAccessToken(refreshToken: string, tokenEndpoint: string, clientId?: string, clientSecret?: string): Promise<{
    accessToken: string;
    refreshToken?: string;
}>;
/**
 * Verify a JWT token's signature and claims using JWKS.
 *
 * This function performs full cryptographic signature verification by fetching
 * the public keys from the JWKS URI. It also validates expiration, issuer, and
 * audience claims.
 *
 * The JWKS is cached per URI, and jose handles automatic key refresh internally.
 *
 * @param token - The JWT token string to verify
 * @param options - Verification options including JWKS URI and expected claims
 * @returns The decoded and verified JWT payload
 * @throws {JwtSignatureError} If signature verification fails
 * @throws {TokenExpiredError} If the token has expired
 * @throws {TokenValidationError} If claims validation fails (wrong issuer/audience)
 *
 * @example
 * ```typescript
 * const payload = await verifyJwt(token, {
 *   jwksUri: 'https://auth.example.com/.well-known/jwks.json',
 *   issuer: 'https://auth.example.com/',
 *   audience: 'https://api.example.com',
 * });
 * ```
 */
export declare function verifyJwt(token: string, options: JwtVerifyOptions): Promise<JWTPayload>;
/**
 * Clear the JWKS cache (useful for testing).
 * @internal
 */
export declare function clearJwksCache(): void;
//# sourceMappingURL=tokens.d.ts.map