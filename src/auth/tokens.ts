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
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { OAuthClient, NormalizedTokenResponse, OAuthError } from './oauth.js';

// =============================================================================
// Constants
// =============================================================================

/** Default buffer time (in seconds) before token expiry to trigger refresh */
const DEFAULT_EXPIRY_BUFFER_SECONDS = 60;

/** Default resource key for tokens without resource indicator */
const DEFAULT_RESOURCE_KEY = '__default__';

// =============================================================================
// JWKS Cache
// =============================================================================

/**
 * Cache for JWKS remote key sets.
 * Jose handles automatic key refresh internally, so no TTL management is needed.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

// =============================================================================
// Zod Schemas
// =============================================================================

export const TokenPayloadSchema = z.object({
  /** Subject identifier */
  sub: z.string(),
  /** Issuer identifier */
  iss: z.string(),
  /** Audience (can be string or array) */
  aud: z.union([z.string(), z.array(z.string())]),
  /** Expiration timestamp (seconds since epoch) */
  exp: z.number(),
  /** Issued at timestamp (seconds since epoch) */
  iat: z.number(),
  /** Scopes (space-separated or array) */
  scope: z.union([z.string(), z.array(z.string())]).optional(),
}).passthrough();

export const TokenValidationOptionsSchema = z.object({
  /** Expected issuer */
  issuer: z.string(),
  /** Expected audience (can be string or array) */
  audience: z.union([z.string(), z.array(z.string())]),
  /** Clock tolerance in seconds (default: 0) */
  clockTolerance: z.number().int().min(0).default(0),
});

export const IntrospectionResponseSchema = z.object({
  /** Whether the token is active */
  active: z.boolean(),
  /** Token scope */
  scope: z.string().optional(),
  /** Client ID */
  client_id: z.string().optional(),
  /** Username */
  username: z.string().optional(),
  /** Token type */
  token_type: z.string().optional(),
  /** Expiration timestamp */
  exp: z.number().optional(),
  /** Issued at timestamp */
  iat: z.number().optional(),
  /** Not before timestamp */
  nbf: z.number().optional(),
  /** Subject */
  sub: z.string().optional(),
  /** Audience */
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  /** Issuer */
  iss: z.string().optional(),
  /** JWT ID */
  jti: z.string().optional(),
}).passthrough();

export const TokenManagerConfigSchema = z.object({
  /** Buffer time in seconds before expiry to consider token expired */
  expiryBufferSeconds: z.number().int().min(0).default(DEFAULT_EXPIRY_BUFFER_SECONDS),
  /** Token introspection endpoint URL (RFC 7662) */
  introspectionEndpoint: z.string().url().optional(),
  /** Client ID for introspection requests */
  clientId: z.string().optional(),
  /** Client secret for introspection requests */
  clientSecret: z.string().optional(),
});

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Token-specific error
 */
export class TokenError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'TokenError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Token expired error
 */
export class TokenExpiredError extends TokenError {
  constructor(message = 'Token has expired') {
    super('token_expired', message);
    this.name = 'TokenExpiredError';
  }
}

/**
 * Token validation error
 */
export class TokenValidationError extends TokenError {
  constructor(message = 'Token validation failed') {
    super('token_invalid', message);
    this.name = 'TokenValidationError';
  }
}

/**
 * Token refresh error
 */
export class TokenRefreshError extends TokenError {
  constructor(message = 'Token refresh failed') {
    super('refresh_failed', message);
    this.name = 'TokenRefreshError';
  }
}

/**
 * JWT signature verification error
 */
export class JwtSignatureError extends TokenError {
  constructor(message = 'JWT signature verification failed') {
    super('signature_invalid', message);
    this.name = 'JwtSignatureError';
  }
}

// =============================================================================
// Token Manager
// =============================================================================

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
export class TokenManager {
  private readonly config: TokenManagerConfig;
  private readonly oauthClient: OAuthClient | undefined;
  private readonly tokens: Map<string, StoredToken> = new Map();
  private refreshPromises: Map<string, Promise<TokenRefreshResult>> = new Map();

  constructor(options: {
    /** Token manager configuration */
    config?: Partial<TokenManagerConfig>;
    /** OAuth client for refresh operations */
    oauthClient?: OAuthClient;
  } = {}) {
    this.config = TokenManagerConfigSchema.parse(options.config ?? {});
    this.oauthClient = options.oauthClient;
  }

  /**
   * Store a token from a token response.
   *
   * @param response - The normalized token response
   * @param resource - Optional resource indicator for this token
   * @returns The stored token entry
   */
  storeToken(response: NormalizedTokenResponse, resource?: string): StoredToken {
    const now = Date.now();
    const expiresAt = response.expiresIn
      ? now + response.expiresIn * 1000
      : now + 3600 * 1000; // Default to 1 hour if not specified

    const token: StoredToken = {
      accessToken: response.accessToken,
      tokenType: response.tokenType,
      expiresAt,
      storedAt: now,
    };

    // Only add optional fields if they have values
    if (response.refreshToken) {
      token.refreshToken = response.refreshToken;
    }
    if (response.scope) {
      token.scope = response.scope;
    }
    if (response.idToken) {
      token.idToken = response.idToken;
    }
    if (resource) {
      token.resource = resource;
    }

    const key = this.getResourceKey(resource);
    this.tokens.set(key, token);

    return token;
  }

  /**
   * Get a stored token for a resource.
   *
   * @param resource - Optional resource indicator
   * @returns The stored token or undefined
   */
  getToken(resource?: string): StoredToken | undefined {
    const key = this.getResourceKey(resource);
    return this.tokens.get(key);
  }

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
  async getValidAccessToken(resource?: string): Promise<string> {
    const key = this.getResourceKey(resource);
    const token = this.tokens.get(key);

    if (!token) {
      throw new TokenError('no_token', 'No token available for this resource');
    }

    // Check if token is expired or about to expire
    if (this.isTokenExpired(token)) {
      // Try to refresh
      const result = await this.refreshTokenIfPossible(key, token);
      if (!result.success || !result.token) {
        throw new TokenExpiredError(result.error ?? 'Token expired and refresh failed');
      }
      return result.token.accessToken;
    }

    return token.accessToken;
  }

  /**
   * Check if a stored token is expired (with buffer time).
   *
   * @param token - The stored token to check
   * @returns true if expired or about to expire
   */
  isTokenExpired(token: StoredToken): boolean {
    const now = Date.now();
    const bufferMs = this.config.expiryBufferSeconds * 1000;
    return token.expiresAt <= now + bufferMs;
  }

  /**
   * Check if a token payload is expired.
   *
   * @param payload - The decoded token payload
   * @param toleranceSeconds - Clock tolerance in seconds
   * @returns true if expired
   */
  isPayloadExpired(payload: TokenPayload, toleranceSeconds = 0): boolean {
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now - toleranceSeconds;
  }

  /**
   * Refresh a token using the OAuth client.
   *
   * @param resource - Optional resource indicator
   * @returns The refresh result
   */
  async refresh(resource?: string): Promise<TokenRefreshResult> {
    const key = this.getResourceKey(resource);
    const token = this.tokens.get(key);

    if (!token) {
      return { success: false, error: 'No token to refresh' };
    }

    return this.refreshTokenIfPossible(key, token);
  }

  /**
   * Remove a token from storage.
   *
   * @param resource - Optional resource indicator
   * @returns true if a token was removed
   */
  removeToken(resource?: string): boolean {
    const key = this.getResourceKey(resource);
    return this.tokens.delete(key);
  }

  /**
   * Clear all stored tokens.
   */
  clear(): void {
    this.tokens.clear();
    this.refreshPromises.clear();
  }

  /**
   * Get all stored resource keys.
   *
   * @returns Array of resource keys (excluding default)
   */
  getStoredResources(): string[] {
    const resources: string[] = [];
    for (const [key] of this.tokens) {
      if (key !== DEFAULT_RESOURCE_KEY) {
        resources.push(key);
      }
    }
    return resources;
  }

  /**
   * Check if any tokens are stored.
   *
   * @returns true if at least one token is stored
   */
  hasTokens(): boolean {
    return this.tokens.size > 0;
  }

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
  validateJwtFormat(token: string, options?: TokenValidationOptions): TokenPayload {
    // Check basic JWT structure (3 parts separated by dots)
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new TokenValidationError('Invalid JWT format: expected 3 parts');
    }

    // Decode the payload (middle part)
    let payload: unknown;
    try {
      const payloadBase64 = parts[1] as string;
      // Add padding if needed
      const paddedPayload = payloadBase64 + '='.repeat((4 - (payloadBase64.length % 4)) % 4);
      const payloadJson = Buffer.from(paddedPayload, 'base64url').toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch {
      throw new TokenValidationError('Invalid JWT format: failed to decode payload');
    }

    // Validate payload structure
    const parseResult = TokenPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      throw new TokenValidationError(`Invalid JWT payload: ${parseResult.error.message}`);
    }

    const validPayload = parseResult.data;

    // Validate claims if options provided
    if (options) {
      const parsedOptions = TokenValidationOptionsSchema.parse(options);

      // Check issuer
      if (validPayload.iss !== parsedOptions.issuer) {
        throw new TokenValidationError(`Invalid issuer: expected ${parsedOptions.issuer}`);
      }

      // Check audience
      const expectedAudiences = Array.isArray(parsedOptions.audience)
        ? parsedOptions.audience
        : [parsedOptions.audience];
      const tokenAudiences = Array.isArray(validPayload.aud)
        ? validPayload.aud
        : [validPayload.aud];
      const hasValidAudience = expectedAudiences.some(aud => tokenAudiences.includes(aud));
      if (!hasValidAudience) {
        throw new TokenValidationError('Invalid audience');
      }

      // Check expiration with tolerance
      if (this.isPayloadExpired(validPayload, parsedOptions.clockTolerance)) {
        throw new TokenExpiredError('Token has expired');
      }
    }

    return validPayload;
  }

  /**
   * Introspect a token using RFC 7662 token introspection.
   *
   * @param token - The token to introspect
   * @param tokenTypeHint - Optional hint about the token type
   * @returns The introspection response
   * @throws {TokenError} If introspection is not configured or fails
   */
  async introspect(
    token: string,
    tokenTypeHint?: 'access_token' | 'refresh_token'
  ): Promise<IntrospectionResponse> {
    if (!this.config.introspectionEndpoint) {
      throw new TokenError('not_configured', 'Token introspection endpoint not configured');
    }

    const body = new URLSearchParams();
    body.set('token', token);
    if (tokenTypeHint) {
      body.set('token_type_hint', tokenTypeHint);
    }

    // Build headers with client authentication if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    // Use Basic authentication if credentials are available
    if (this.config.clientId && this.config.clientSecret) {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    const response = await fetch(this.config.introspectionEndpoint, {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!response.ok) {
      throw new TokenError(
        'introspection_failed',
        `Token introspection failed with status ${response.status}`
      );
    }

    const responseBody = await response.json();
    return IntrospectionResponseSchema.parse(responseBody);
  }

  /**
   * Validate a token using introspection (for opaque tokens).
   *
   * @param token - The token to validate
   * @returns true if the token is active
   */
  async validateWithIntrospection(token: string): Promise<boolean> {
    try {
      const result = await this.introspect(token, 'access_token');
      return result.active;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Get the storage key for a resource.
   */
  private getResourceKey(resource?: string): string {
    return resource ?? DEFAULT_RESOURCE_KEY;
  }

  /**
   * Refresh a token if possible, with deduplication.
   */
  private async refreshTokenIfPossible(
    key: string,
    token: StoredToken
  ): Promise<TokenRefreshResult> {
    // Check if refresh is possible
    if (!token.refreshToken) {
      return { success: false, error: 'No refresh token available' };
    }

    if (!this.oauthClient) {
      return { success: false, error: 'No OAuth client configured for refresh' };
    }

    // Check if a refresh is already in progress for this key
    const existingPromise = this.refreshPromises.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    // Start a new refresh
    const refreshPromise = this.performRefresh(key, token);
    this.refreshPromises.set(key, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      this.refreshPromises.delete(key);
    }
  }

  /**
   * Perform the actual token refresh.
   */
  private async performRefresh(
    key: string,
    token: StoredToken
  ): Promise<TokenRefreshResult> {
    if (!token.refreshToken || !this.oauthClient) {
      return { success: false, error: 'Refresh not possible' };
    }

    try {
      const refreshOptions: { resource?: string; scopes?: string[] } = {};
      if (token.resource) {
        refreshOptions.resource = token.resource;
      }
      if (token.scope) {
        refreshOptions.scopes = token.scope.split(' ');
      }
      const response = await this.oauthClient.refreshToken(token.refreshToken, refreshOptions);

      // Store the new token (handles rotation - new refresh token replaces old)
      const newToken = this.storeToken(response, token.resource);

      return { success: true, token: newToken };
    } catch (error) {
      // Handle specific OAuth errors
      if (error instanceof OAuthError) {
        // If refresh token is invalid/expired, remove the stored token
        if (error.errorCode === 'invalid_grant') {
          this.tokens.delete(key);
        }
        return { success: false, error: error.message };
      }

      // Generic error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }
}

// =============================================================================
// Standalone Functions (backward compatibility)
// =============================================================================

/**
 * Check if a token payload is expired.
 *
 * @param payload - The decoded token payload
 * @param toleranceSeconds - Clock tolerance in seconds
 * @returns true if expired
 */
export function isTokenExpired(payload: TokenPayload, toleranceSeconds = 0): boolean {
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now - toleranceSeconds;
}

/**
 * Validate an access token (JWT format).
 *
 * @param token - The token string
 * @param options - Validation options
 * @returns The decoded payload
 * @throws {TokenValidationError} If validation fails
 */
export async function validateAccessToken(
  token: string,
  options: TokenValidationOptions
): Promise<TokenPayload> {
  const manager = new TokenManager();
  return manager.validateJwtFormat(token, options);
}

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
export async function refreshAccessToken(
  refreshToken: string,
  tokenEndpoint: string,
  clientId?: string,
  clientSecret?: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);
  if (clientId) {
    body.set('client_id', clientId);
  }
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new TokenRefreshError(`Token refresh failed with status ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; refresh_token?: string };
  const result: { accessToken: string; refreshToken?: string } = {
    accessToken: data.access_token,
  };
  if (data.refresh_token) {
    result.refreshToken = data.refresh_token;
  }
  return result;
}

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
export async function verifyJwt(token: string, options: JwtVerifyOptions): Promise<JWTPayload> {
  // Get or create cached JWKS
  let jwks = jwksCache.get(options.jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(options.jwksUri));
    jwksCache.set(options.jwksUri, jwks);
  }

  try {
    // Build verification options, only including defined values
    const verifyOptions: { issuer?: string; audience?: string } = {};
    if (options.issuer !== undefined) {
      verifyOptions.issuer = options.issuer;
    }
    if (options.audience !== undefined) {
      verifyOptions.audience = options.audience;
    }

    const { payload } = await jwtVerify(token, jwks, verifyOptions);

    return payload;
  } catch (error) {
    // Handle specific jose errors and map to our error types
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Check for expiration errors
      if (message.includes('exp') || message.includes('expired')) {
        throw new TokenExpiredError('Token has expired');
      }

      // Check for signature errors
      if (
        message.includes('signature') ||
        message.includes('jws') ||
        message.includes('verification failed')
      ) {
        throw new JwtSignatureError('JWT signature verification failed');
      }

      // Check for issuer/audience validation errors
      if (message.includes('issuer') || message.includes('audience') || message.includes('iss') || message.includes('aud')) {
        throw new TokenValidationError(error.message);
      }

      // Re-throw with more context
      throw new TokenValidationError(`JWT verification failed: ${error.message}`);
    }

    throw new TokenValidationError('JWT verification failed');
  }
}

/**
 * Clear the JWKS cache (useful for testing).
 * @internal
 */
export function clearJwksCache(): void {
  jwksCache.clear();
}
