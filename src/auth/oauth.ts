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
import { randomBytes } from 'node:crypto';
import { generateCodeVerifier, generateCodeChallenge, base64UrlEncode } from './pkce.js';

// =============================================================================
// Constants
// =============================================================================

/** State parameter length in bytes (32 bytes = 256 bits of entropy) */
const STATE_LENGTH_BYTES = 32;

/** Default scopes for MCP */
const DEFAULT_SCOPES = ['openid', 'profile'];

// =============================================================================
// Zod Schemas
// =============================================================================

export const OAuthConfigSchema = z.object({
  /** Authorization server issuer URL (e.g., https://your-tenant.auth0.com) */
  issuer: z.string().url(),
  /** OAuth client ID */
  clientId: z.string().min(1),
  /** OAuth client secret (optional for public clients) */
  clientSecret: z.string().optional(),
  /** Redirect URI for authorization callback */
  redirectUri: z.string().url().optional(),
  /** Default scopes to request */
  scopes: z.array(z.string()).default(DEFAULT_SCOPES),
  /** Custom authorization endpoint (overrides discovery) */
  authorizationEndpoint: z.string().url().optional(),
  /** Custom token endpoint (overrides discovery) */
  tokenEndpoint: z.string().url().optional(),
});

export const AuthorizationRequestSchema = z.object({
  /** Response type - always 'code' for authorization code flow */
  responseType: z.literal('code'),
  /** OAuth client ID */
  clientId: z.string().min(1),
  /** Redirect URI for callback */
  redirectUri: z.string().url(),
  /** Space-separated scopes */
  scope: z.string().optional(),
  /** CSRF state parameter */
  state: z.string().min(1),
  /** PKCE code challenge */
  codeChallenge: z.string().min(1),
  /** PKCE code challenge method - only S256 supported */
  codeChallengeMethod: z.literal('S256'),
  /** Resource indicators (RFC 8707) */
  resource: z.array(z.string().url()).optional(),
  /** Audience parameter (Auth0-specific) */
  audience: z.string().optional(),
});

export const TokenRequestSchema = z.object({
  /** Grant type */
  grantType: z.enum(['authorization_code', 'refresh_token', 'client_credentials']),
  /** Authorization code (for authorization_code grant) */
  code: z.string().optional(),
  /** Redirect URI (must match authorization request) */
  redirectUri: z.string().url().optional(),
  /** PKCE code verifier */
  codeVerifier: z.string().optional(),
  /** Refresh token (for refresh_token grant) */
  refreshToken: z.string().optional(),
  /** Requested scopes */
  scope: z.string().optional(),
  /** Resource indicators (RFC 8707) */
  resource: z.string().url().optional(),
});

export const TokenResponseSchema = z.object({
  /** The access token */
  access_token: z.string(),
  /** Token type - always Bearer */
  token_type: z.literal('Bearer'),
  /** Token expiration in seconds */
  expires_in: z.number().int().positive().optional(),
  /** Refresh token for obtaining new access tokens */
  refresh_token: z.string().optional(),
  /** Granted scopes (space-separated) */
  scope: z.string().optional(),
  /** ID token (if openid scope was requested) */
  id_token: z.string().optional(),
});

export const TokenErrorResponseSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
  error_uri: z.string().url().optional(),
});

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Error Classes
// =============================================================================

/**
 * OAuth-specific error
 */
export class OAuthError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly errorUri?: string
  ) {
    super(message);
    this.name = 'OAuthError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static fromTokenError(response: TokenErrorResponse): OAuthError {
    return new OAuthError(
      response.error,
      response.error_description ?? response.error,
      response.error_uri
    );
  }
}

/**
 * State validation error (CSRF protection)
 */
export class StateValidationError extends OAuthError {
  constructor(message = 'State parameter validation failed') {
    super('invalid_state', message);
    this.name = 'StateValidationError';
  }
}

/**
 * Session expired error
 */
export class SessionExpiredError extends OAuthError {
  constructor(message = 'Authorization session has expired') {
    super('session_expired', message);
    this.name = 'SessionExpiredError';
  }
}

// =============================================================================
// State Management
// =============================================================================

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
export function generateState(): string {
  const randomBuffer = randomBytes(STATE_LENGTH_BYTES);
  return base64UrlEncode(randomBuffer);
}

/**
 * Validate that a received state matches the expected state.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param received - The state received in the callback
 * @param expected - The state stored from the original request
 * @returns true if states match, false otherwise
 */
export function validateState(received: string, expected: string): boolean {
  if (typeof received !== 'string' || typeof expected !== 'string') {
    return false;
  }

  if (received.length !== expected.length) {
    return false;
  }

  // Timing-safe comparison
  let result = 0;
  for (let i = 0; i < received.length; i++) {
    result |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return result === 0;
}

// =============================================================================
// URL Building
// =============================================================================

/**
 * Build Auth0-compatible authorization endpoint URL.
 *
 * @param issuer - The issuer URL (e.g., https://your-tenant.auth0.com)
 * @returns The authorization endpoint URL
 */
export function getAuthorizationEndpoint(issuer: string): string {
  const baseUrl = issuer.endsWith('/') ? issuer.slice(0, -1) : issuer;
  return `${baseUrl}/authorize`;
}

/**
 * Build Auth0-compatible token endpoint URL.
 *
 * @param issuer - The issuer URL
 * @returns The token endpoint URL
 */
export function getTokenEndpoint(issuer: string): string {
  const baseUrl = issuer.endsWith('/') ? issuer.slice(0, -1) : issuer;
  return `${baseUrl}/oauth/token`;
}

// =============================================================================
// OAuth Client
// =============================================================================

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
export class OAuthClient {
  private readonly config: OAuthConfig;
  private readonly authorizationEndpoint: string;
  private readonly tokenEndpoint: string;

  constructor(config: OAuthConfig) {
    this.config = OAuthConfigSchema.parse(config);

    // Determine endpoints (custom or derived from issuer)
    this.authorizationEndpoint =
      this.config.authorizationEndpoint ?? getAuthorizationEndpoint(this.config.issuer);
    this.tokenEndpoint =
      this.config.tokenEndpoint ?? getTokenEndpoint(this.config.issuer);
  }

  /**
   * Get the OAuth configuration.
   */
  getConfig(): OAuthConfig {
    return { ...this.config };
  }

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
  buildAuthorizationUrl(options: {
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
  } = {}): AuthorizationUrlResult {
    const redirectUri = options.redirectUri ?? this.config.redirectUri;
    if (!redirectUri) {
      throw new Error('Redirect URI is required');
    }

    const scopes = options.scopes ?? this.config.scopes;
    const resources = options.resources;
    const sessionExpiresIn = options.sessionExpiresIn ?? 600;

    // Generate PKCE pair
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Generate state for CSRF protection
    const state = generateState();

    // Build URL parameters
    const params = new URLSearchParams();
    params.set('response_type', 'code');
    params.set('client_id', this.config.clientId);
    params.set('redirect_uri', redirectUri);
    params.set('state', state);
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');

    // Add scopes if provided
    if (scopes.length > 0) {
      params.set('scope', scopes.join(' '));
    }

    // Add resource indicators (RFC 8707)
    // Each resource is added as a separate parameter
    if (resources && resources.length > 0) {
      for (const resource of resources) {
        params.append('resource', resource);
      }
    }

    // Add audience (Auth0-specific)
    if (options.audience) {
      params.set('audience', options.audience);
    }

    // Add any additional parameters
    if (options.additionalParams) {
      for (const [key, value] of Object.entries(options.additionalParams)) {
        params.set(key, value);
      }
    }

    // Build the complete URL
    const url = `${this.authorizationEndpoint}?${params.toString()}`;

    // Create session for callback validation
    const now = Date.now();
    const session: AuthorizationSession = {
      state,
      codeVerifier,
      redirectUri,
      scopes,
      createdAt: now,
      expiresAt: now + sessionExpiresIn * 1000,
    };

    // Only add resources if they were provided
    if (resources && resources.length > 0) {
      session.resources = resources;
    }

    return { url, session };
  }

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
  async handleCallback(
    params: AuthorizationCallbackParams,
    session: AuthorizationSession
  ): Promise<NormalizedTokenResponse> {
    // Check for authorization error
    if (params.error) {
      throw new OAuthError(
        params.error,
        params.errorDescription ?? params.error
      );
    }

    // Validate state (CSRF protection)
    if (!validateState(params.state, session.state)) {
      throw new StateValidationError();
    }

    // Check session expiration
    if (Date.now() > session.expiresAt) {
      throw new SessionExpiredError();
    }

    // Exchange code for tokens
    const exchangeOptions: {
      code: string;
      codeVerifier: string;
      redirectUri: string;
      resource?: string;
    } = {
      code: params.code,
      codeVerifier: session.codeVerifier,
      redirectUri: session.redirectUri,
    };

    // Add resource if available
    const firstResource = session.resources?.[0];
    if (firstResource) {
      exchangeOptions.resource = firstResource;
    }

    return this.exchangeCode(exchangeOptions);
  }

  /**
   * Exchange an authorization code for tokens.
   *
   * @param options - Token exchange options
   * @returns The normalized token response
   * @throws {OAuthError} If the token endpoint returns an error
   */
  async exchangeCode(options: {
    /** The authorization code */
    code: string;
    /** The PKCE code verifier */
    codeVerifier: string;
    /** The redirect URI (must match authorization request) */
    redirectUri: string;
    /** Resource indicator for the token (RFC 8707) */
    resource?: string;
  }): Promise<NormalizedTokenResponse> {
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('client_id', this.config.clientId);
    body.set('code', options.code);
    body.set('code_verifier', options.codeVerifier);
    body.set('redirect_uri', options.redirectUri);

    // Add client secret if available (confidential clients)
    if (this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }

    // Add resource indicator if provided
    if (options.resource) {
      body.set('resource', options.resource);
    }

    return this.requestToken(body);
  }

  /**
   * Refresh an access token using a refresh token.
   *
   * @param refreshToken - The refresh token
   * @param options - Refresh options
   * @returns The normalized token response
   * @throws {OAuthError} If the token endpoint returns an error
   */
  async refreshToken(
    refreshToken: string,
    options: {
      /** Override scopes for the new token */
      scopes?: string[];
      /** Resource indicator for the new token */
      resource?: string;
    } = {}
  ): Promise<NormalizedTokenResponse> {
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('client_id', this.config.clientId);
    body.set('refresh_token', refreshToken);

    // Add client secret if available
    if (this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }

    // Add scopes if provided
    if (options.scopes && options.scopes.length > 0) {
      body.set('scope', options.scopes.join(' '));
    }

    // Add resource indicator if provided
    if (options.resource) {
      body.set('resource', options.resource);
    }

    return this.requestToken(body);
  }

  /**
   * Make a token request to the token endpoint.
   *
   * @param body - The URL-encoded request body
   * @returns The normalized token response
   * @throws {OAuthError} If the request fails
   */
  private async requestToken(body: URLSearchParams): Promise<NormalizedTokenResponse> {
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      const errorResponse = TokenErrorResponseSchema.safeParse(responseBody);
      if (errorResponse.success) {
        throw OAuthError.fromTokenError(errorResponse.data);
      }
      throw new OAuthError(
        'server_error',
        `Token request failed with status ${response.status}`
      );
    }

    const tokenResponse = TokenResponseSchema.parse(responseBody);
    return normalizeTokenResponse(tokenResponse);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize a token response from snake_case to camelCase.
 */
export function normalizeTokenResponse(response: TokenResponse): NormalizedTokenResponse {
  const result: NormalizedTokenResponse = {
    accessToken: response.access_token,
    tokenType: response.token_type,
  };

  if (response.expires_in !== undefined) {
    result.expiresIn = response.expires_in;
  }
  if (response.refresh_token !== undefined) {
    result.refreshToken = response.refresh_token;
  }
  if (response.scope !== undefined) {
    result.scope = response.scope;
  }
  if (response.id_token !== undefined) {
    result.idToken = response.id_token;
  }

  return result;
}

/**
 * Parse authorization callback parameters from a URL.
 *
 * @param url - The callback URL
 * @returns The parsed callback parameters
 * @throws {OAuthError} If required parameters are missing
 */
export function parseCallbackUrl(url: string): AuthorizationCallbackParams {
  const parsedUrl = new URL(url);
  const params = parsedUrl.searchParams;

  // Check for error response
  const error = params.get('error');
  if (error) {
    const result: AuthorizationCallbackParams = {
      code: '',
      state: params.get('state') ?? '',
      error,
    };
    const errorDescription = params.get('error_description');
    if (errorDescription) {
      result.errorDescription = errorDescription;
    }
    return result;
  }

  // Get required parameters
  const code = params.get('code');
  const state = params.get('state');

  if (!code) {
    throw new OAuthError('invalid_request', 'Missing authorization code');
  }

  if (!state) {
    throw new OAuthError('invalid_request', 'Missing state parameter');
  }

  return { code, state };
}

/**
 * Create an OAuth client from Auth0 configuration.
 *
 * @param domain - Auth0 domain (e.g., 'your-tenant.auth0.com')
 * @param clientId - OAuth client ID
 * @param options - Additional options
 * @returns Configured OAuth client
 */
export function createAuth0Client(
  domain: string,
  clientId: string,
  options: {
    clientSecret?: string;
    redirectUri?: string;
    scopes?: string[];
    audience?: string;
  } = {}
): OAuthClient {
  // Normalize domain to issuer URL
  const issuer = domain.startsWith('https://')
    ? domain
    : `https://${domain}`;

  return new OAuthClient({
    issuer,
    clientId,
    clientSecret: options.clientSecret,
    redirectUri: options.redirectUri,
    scopes: options.scopes ?? DEFAULT_SCOPES,
    // Auth0 uses /oauth/token, which is what getTokenEndpoint returns
  });
}

// =============================================================================
// Legacy Exports (for backward compatibility)
// =============================================================================

/**
 * @deprecated Use OAuthClient instead
 */
export class OAuthHandler {
  private readonly client: OAuthClient;

  constructor(config: { issuer: string; clientId: string; clientSecret?: string; redirectUri?: string; scopes?: string[] }) {
    // Ensure scopes has a default value for the OAuthClient
    const clientConfig = {
      issuer: config.issuer,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      scopes: config.scopes ?? DEFAULT_SCOPES,
    };
    this.client = new OAuthClient(clientConfig);
  }

  async authorize(request: {
    responseType: 'code';
    clientId: string;
    redirectUri: string;
    scope?: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: 'S256';
  }): Promise<string> {
    const options: { redirectUri: string; scopes?: string[] } = {
      redirectUri: request.redirectUri,
    };
    if (request.scope) {
      options.scopes = request.scope.split(' ');
    }
    const { url } = this.client.buildAuthorizationUrl(options);
    return url;
  }

  async token(request: {
    grantType: 'authorization_code' | 'refresh_token' | 'client_credentials';
    code?: string;
    redirectUri?: string;
    codeVerifier?: string;
    refreshToken?: string;
    scope?: string;
  }): Promise<{ accessToken: string; tokenType: 'Bearer'; expiresIn?: number | undefined; refreshToken?: string | undefined; scope?: string | undefined }> {
    if (request.grantType === 'authorization_code') {
      if (!request.code || !request.codeVerifier || !request.redirectUri) {
        throw new Error('Missing required parameters for authorization_code grant');
      }
      return this.client.exchangeCode({
        code: request.code,
        codeVerifier: request.codeVerifier,
        redirectUri: request.redirectUri,
      });
    }

    if (request.grantType === 'refresh_token') {
      if (!request.refreshToken) {
        throw new Error('Missing refresh token');
      }
      const refreshOptions: { scopes?: string[] } = {};
      if (request.scope) {
        refreshOptions.scopes = request.scope.split(' ');
      }
      return this.client.refreshToken(request.refreshToken, refreshOptions);
    }

    throw new Error(`Unsupported grant type: ${request.grantType}`);
  }
}
