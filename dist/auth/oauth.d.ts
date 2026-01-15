/**
 * OAuth 2.1 Authorization Code flow implementation
 *
 * Implements:
 * - Authorization request construction with PKCE (RFC 7636)
 * - State parameter for CSRF protection
 * - Token exchange with code verifier
 * - Resource indicators (RFC 8707)
 * - Auth0-compatible endpoints
 */
import { z } from 'zod';
export declare const OAuthConfigSchema: z.ZodObject<{
    /** Authorization server issuer URL (e.g., https://your-tenant.auth0.com) */
    issuer: z.ZodString;
    /** OAuth client ID */
    clientId: z.ZodString;
    /** OAuth client secret (optional for public clients) */
    clientSecret: z.ZodOptional<z.ZodString>;
    /** Redirect URI for authorization callback */
    redirectUri: z.ZodOptional<z.ZodString>;
    /** Default scopes to request */
    scopes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Custom authorization endpoint (overrides discovery) */
    authorizationEndpoint: z.ZodOptional<z.ZodString>;
    /** Custom token endpoint (overrides discovery) */
    tokenEndpoint: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    issuer: string;
    scopes: string[];
    clientSecret?: string | undefined;
    redirectUri?: string | undefined;
    authorizationEndpoint?: string | undefined;
    tokenEndpoint?: string | undefined;
}, {
    clientId: string;
    issuer: string;
    clientSecret?: string | undefined;
    redirectUri?: string | undefined;
    scopes?: string[] | undefined;
    authorizationEndpoint?: string | undefined;
    tokenEndpoint?: string | undefined;
}>;
export declare const AuthorizationRequestSchema: z.ZodObject<{
    /** Response type - always 'code' for authorization code flow */
    responseType: z.ZodLiteral<"code">;
    /** OAuth client ID */
    clientId: z.ZodString;
    /** Redirect URI for callback */
    redirectUri: z.ZodString;
    /** Space-separated scopes */
    scope: z.ZodOptional<z.ZodString>;
    /** CSRF state parameter */
    state: z.ZodString;
    /** PKCE code challenge */
    codeChallenge: z.ZodString;
    /** PKCE code challenge method - only S256 supported */
    codeChallengeMethod: z.ZodLiteral<"S256">;
    /** Resource indicators (RFC 8707) */
    resource: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Audience parameter (Auth0-specific) */
    audience: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    redirectUri: string;
    responseType: "code";
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    audience?: string | undefined;
    resource?: string[] | undefined;
    scope?: string | undefined;
}, {
    clientId: string;
    redirectUri: string;
    responseType: "code";
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    audience?: string | undefined;
    resource?: string[] | undefined;
    scope?: string | undefined;
}>;
export declare const TokenRequestSchema: z.ZodObject<{
    /** Grant type */
    grantType: z.ZodEnum<["authorization_code", "refresh_token", "client_credentials"]>;
    /** Authorization code (for authorization_code grant) */
    code: z.ZodOptional<z.ZodString>;
    /** Redirect URI (must match authorization request) */
    redirectUri: z.ZodOptional<z.ZodString>;
    /** PKCE code verifier */
    codeVerifier: z.ZodOptional<z.ZodString>;
    /** Refresh token (for refresh_token grant) */
    refreshToken: z.ZodOptional<z.ZodString>;
    /** Requested scopes */
    scope: z.ZodOptional<z.ZodString>;
    /** Resource indicators (RFC 8707) */
    resource: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    grantType: "authorization_code" | "refresh_token" | "client_credentials";
    code?: string | undefined;
    resource?: string | undefined;
    redirectUri?: string | undefined;
    scope?: string | undefined;
    codeVerifier?: string | undefined;
    refreshToken?: string | undefined;
}, {
    grantType: "authorization_code" | "refresh_token" | "client_credentials";
    code?: string | undefined;
    resource?: string | undefined;
    redirectUri?: string | undefined;
    scope?: string | undefined;
    codeVerifier?: string | undefined;
    refreshToken?: string | undefined;
}>;
export declare const TokenResponseSchema: z.ZodObject<{
    /** The access token */
    access_token: z.ZodString;
    /** Token type - always Bearer */
    token_type: z.ZodLiteral<"Bearer">;
    /** Token expiration in seconds */
    expires_in: z.ZodOptional<z.ZodNumber>;
    /** Refresh token for obtaining new access tokens */
    refresh_token: z.ZodOptional<z.ZodString>;
    /** Granted scopes (space-separated) */
    scope: z.ZodOptional<z.ZodString>;
    /** ID token (if openid scope was requested) */
    id_token: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    access_token: string;
    token_type: "Bearer";
    scope?: string | undefined;
    refresh_token?: string | undefined;
    expires_in?: number | undefined;
    id_token?: string | undefined;
}, {
    access_token: string;
    token_type: "Bearer";
    scope?: string | undefined;
    refresh_token?: string | undefined;
    expires_in?: number | undefined;
    id_token?: string | undefined;
}>;
export declare const TokenErrorResponseSchema: z.ZodObject<{
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
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;
export type AuthorizationRequest = z.infer<typeof AuthorizationRequestSchema>;
export type TokenRequest = z.infer<typeof TokenRequestSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type TokenErrorResponse = z.infer<typeof TokenErrorResponseSchema>;
/** Normalized token response with camelCase properties */
export interface NormalizedTokenResponse {
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn?: number | undefined;
    refreshToken?: string | undefined;
    scope?: string | undefined;
    idToken?: string | undefined;
}
/** Authorization session for tracking state and PKCE */
export interface AuthorizationSession {
    /** CSRF state parameter */
    state: string;
    /** PKCE code verifier (keep secret, never sent to authorization server) */
    codeVerifier: string;
    /** Redirect URI used in authorization request */
    redirectUri: string;
    /** Requested scopes */
    scopes: string[];
    /** Resource indicators requested */
    resources?: string[] | undefined;
    /** Creation timestamp */
    createdAt: number;
    /** Expiration timestamp (sessions should expire after ~10 minutes) */
    expiresAt: number;
}
/** Authorization URL result */
export interface AuthorizationUrlResult {
    /** The complete authorization URL to redirect the user to */
    url: string;
    /** The session data to store for validation on callback */
    session: AuthorizationSession;
}
/** Callback parameters received from authorization server */
export interface AuthorizationCallbackParams {
    /** Authorization code */
    code: string;
    /** State parameter for CSRF validation */
    state: string;
    /** Error code if authorization failed */
    error?: string | undefined;
    /** Error description */
    errorDescription?: string | undefined;
}
/**
 * OAuth-specific error
 */
export declare class OAuthError extends Error {
    readonly errorCode: string;
    readonly errorUri?: string | undefined;
    constructor(errorCode: string, message: string, errorUri?: string | undefined);
    static fromTokenError(response: TokenErrorResponse): OAuthError;
}
/**
 * State validation error (CSRF protection)
 */
export declare class StateValidationError extends OAuthError {
    constructor(message?: string);
}
/**
 * Session expired error
 */
export declare class SessionExpiredError extends OAuthError {
    constructor(message?: string);
}
/**
 * Generate a cryptographically secure state parameter for CSRF protection.
 *
 * The state parameter is a random string that:
 * - Is sent to the authorization server in the authorization request
 * - Must be validated when the callback is received
 * - Prevents CSRF attacks by binding the callback to the original request
 *
 * @returns A base64url-encoded random string (43 characters)
 */
export declare function generateState(): string;
/**
 * Validate that a received state matches the expected state.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param received - The state received in the callback
 * @param expected - The state stored from the original request
 * @returns true if states match, false otherwise
 */
export declare function validateState(received: string, expected: string): boolean;
/**
 * Build Auth0-compatible authorization endpoint URL.
 *
 * @param issuer - The issuer URL (e.g., https://your-tenant.auth0.com)
 * @returns The authorization endpoint URL
 */
export declare function getAuthorizationEndpoint(issuer: string): string;
/**
 * Build Auth0-compatible token endpoint URL.
 *
 * @param issuer - The issuer URL
 * @returns The token endpoint URL
 */
export declare function getTokenEndpoint(issuer: string): string;
/**
 * OAuth 2.1 client for Authorization Code flow with PKCE.
 *
 * Features:
 * - Authorization request construction with all required parameters
 * - PKCE (S256) for public clients
 * - State parameter for CSRF protection
 * - Resource indicators (RFC 8707) support
 * - Auth0-compatible endpoints
 */
export declare class OAuthClient {
    private readonly config;
    private readonly authorizationEndpoint;
    private readonly tokenEndpoint;
    constructor(config: OAuthConfig);
    /**
     * Get the OAuth configuration.
     */
    getConfig(): OAuthConfig;
    /**
     * Build an authorization URL and create a session for callback validation.
     *
     * This method:
     * 1. Generates a cryptographic state parameter for CSRF protection
     * 2. Generates a PKCE code verifier and challenge
     * 3. Constructs the authorization URL with all required parameters
     * 4. Returns the URL and session data for storage
     *
     * @param options - Authorization options
     * @returns The authorization URL and session data
     * @throws {Error} If redirectUri is not configured
     */
    buildAuthorizationUrl(options?: {
        /** Override the configured redirect URI */
        redirectUri?: string;
        /** Override the configured scopes */
        scopes?: string[];
        /** Resource indicators (RFC 8707) for multi-resource access */
        resources?: string[];
        /** Audience parameter (Auth0-specific) */
        audience?: string;
        /** Additional parameters to include */
        additionalParams?: Record<string, string>;
        /** Session expiration in seconds (default: 600 = 10 minutes) */
        sessionExpiresIn?: number;
    }): AuthorizationUrlResult;
    /**
     * Validate an authorization callback and exchange the code for tokens.
     *
     * This method:
     * 1. Validates the state parameter against the stored session
     * 2. Checks that the session hasn't expired
     * 3. Exchanges the authorization code for tokens using PKCE
     *
     * @param params - The callback parameters from the authorization server
     * @param session - The stored authorization session
     * @returns The token response
     * @throws {StateValidationError} If state validation fails
     * @throws {SessionExpiredError} If the session has expired
     * @throws {OAuthError} If the authorization server returned an error
     */
    handleCallback(params: AuthorizationCallbackParams, session: AuthorizationSession): Promise<NormalizedTokenResponse>;
    /**
     * Exchange an authorization code for tokens.
     *
     * @param options - Token exchange options
     * @returns The normalized token response
     * @throws {OAuthError} If the token endpoint returns an error
     */
    exchangeCode(options: {
        /** The authorization code */
        code: string;
        /** The PKCE code verifier */
        codeVerifier: string;
        /** The redirect URI (must match authorization request) */
        redirectUri: string;
        /** Resource indicator for the token (RFC 8707) */
        resource?: string;
    }): Promise<NormalizedTokenResponse>;
    /**
     * Refresh an access token using a refresh token.
     *
     * @param refreshToken - The refresh token
     * @param options - Refresh options
     * @returns The normalized token response
     * @throws {OAuthError} If the token endpoint returns an error
     */
    refreshToken(refreshToken: string, options?: {
        /** Override scopes for the new token */
        scopes?: string[];
        /** Resource indicator for the new token */
        resource?: string;
    }): Promise<NormalizedTokenResponse>;
    /**
     * Make a token request to the token endpoint.
     *
     * @param body - The URL-encoded request body
     * @returns The normalized token response
     * @throws {OAuthError} If the request fails
     */
    private requestToken;
}
/**
 * Normalize a token response from snake_case to camelCase.
 */
export declare function normalizeTokenResponse(response: TokenResponse): NormalizedTokenResponse;
/**
 * Parse authorization callback parameters from a URL.
 *
 * @param url - The callback URL
 * @returns The parsed callback parameters
 * @throws {OAuthError} If required parameters are missing
 */
export declare function parseCallbackUrl(url: string): AuthorizationCallbackParams;
/**
 * Create an OAuth client from Auth0 configuration.
 *
 * @param domain - Auth0 domain (e.g., 'your-tenant.auth0.com')
 * @param clientId - OAuth client ID
 * @param options - Additional options
 * @returns Configured OAuth client
 */
export declare function createAuth0Client(domain: string, clientId: string, options?: {
    clientSecret?: string;
    redirectUri?: string;
    scopes?: string[];
    audience?: string;
}): OAuthClient;
/**
 * @deprecated Use OAuthClient instead
 */
export declare class OAuthHandler {
    private readonly client;
    constructor(config: {
        issuer: string;
        clientId: string;
        clientSecret?: string;
        redirectUri?: string;
        scopes?: string[];
    });
    authorize(request: {
        responseType: 'code';
        clientId: string;
        redirectUri: string;
        scope?: string;
        state?: string;
        codeChallenge?: string;
        codeChallengeMethod?: 'S256';
    }): Promise<string>;
    token(request: {
        grantType: 'authorization_code' | 'refresh_token' | 'client_credentials';
        code?: string;
        redirectUri?: string;
        codeVerifier?: string;
        refreshToken?: string;
        scope?: string;
    }): Promise<{
        accessToken: string;
        tokenType: 'Bearer';
        expiresIn?: number | undefined;
        refreshToken?: string | undefined;
        scope?: string | undefined;
    }>;
}
//# sourceMappingURL=oauth.d.ts.map