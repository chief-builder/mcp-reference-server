/**
 * OAuth 2.1 Server Router
 *
 * Implements OAuth 2.1 authorization server endpoints for development/testing.
 * Supports Authorization Code flow with PKCE (S256 only).
 *
 * Endpoints:
 * - GET /oauth/authorize - Authorization endpoint (auto-approves for dev)
 * - POST /oauth/token - Token endpoint (code exchange and refresh)
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import { OAuthStore, getOAuthStore } from './oauth-store.js';
import { JwtIssuer, getJwtIssuer } from './jwt-issuer.js';
import { verifyCodeChallenge } from '../auth/pkce.js';
import { renderLoginPage } from './login-page.js';

// =============================================================================
// Types
// =============================================================================

export interface OAuthServerOptions {
  /** OAuth store instance (uses default if not provided) */
  store?: OAuthStore;
  /** JWT issuer instance (uses default if not provided) */
  jwtIssuer?: JwtIssuer;
  /** Expected client ID (default: 'mcp-ui-client') */
  clientId?: string;
  /** Allowed redirect URI (default: 'http://localhost:5173/callback') */
  allowedRedirectUri?: string;
  /** Default user subject for auto-approve (default: 'dev-user') */
  devUser?: string;
  /** Access token TTL in seconds (default: 3600) */
  accessTokenTtl?: number;
  /** Refresh token TTL in seconds (default: 86400) */
  refreshTokenTtl?: number;
}

interface AuthorizeQueryParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

interface TokenRequestBody {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  code_verifier?: string;
  refresh_token?: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CLIENT_ID = 'mcp-ui-client';
const DEFAULT_REDIRECT_URI = 'http://localhost:5173/callback';
const DEFAULT_DEV_USER = 'dev-user';
const DEFAULT_ACCESS_TOKEN_TTL = 3600; // 1 hour
const DEFAULT_REFRESH_TOKEN_TTL = 86400; // 24 hours
const DEFAULT_SCOPE = 'openid profile';

// Default test credentials (can be overridden via environment)
const DEFAULT_TEST_USER = 'demo';
const DEFAULT_TEST_PASSWORD = 'demo';

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * OAuth 2.1 error response format
 */
interface OAuthErrorResponse {
  error: string;
  error_description?: string;
}

function oauthError(
  res: Response,
  status: number,
  error: string,
  description?: string
): void {
  const body: OAuthErrorResponse = { error };
  if (description) {
    body.error_description = description;
  }
  res.status(status).json(body);
}

/**
 * Redirect with error for authorization endpoint
 */
function authorizationError(
  res: Response,
  redirectUri: string,
  state: string | undefined,
  error: string,
  description?: string
): void {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (description) {
    url.searchParams.set('error_description', description);
  }
  if (state) {
    url.searchParams.set('state', state);
  }
  res.redirect(302, url.toString());
}

// =============================================================================
// OAuth Router Factory
// =============================================================================

/**
 * Create the OAuth router
 *
 * @param options - Server configuration options
 * @returns Express Router with OAuth endpoints
 */
export function createOAuthRouter(options: OAuthServerOptions = {}): Router {
  const router = Router();

  // Parse URL-encoded bodies for token endpoint
  router.use(express.urlencoded({ extended: false }));

  // Get or create dependencies
  const store = options.store ?? getOAuthStore();
  const jwtIssuer = options.jwtIssuer ?? getJwtIssuer();

  // Configuration
  const clientId = options.clientId ?? DEFAULT_CLIENT_ID;
  const allowedRedirectUri = options.allowedRedirectUri ?? DEFAULT_REDIRECT_URI;
  // devUser from options is now only used as fallback for test credentials
  const _devUser = options.devUser ?? DEFAULT_DEV_USER;
  void _devUser; // Suppress unused warning - kept for backward compatibility
  const accessTokenTtl = options.accessTokenTtl ?? DEFAULT_ACCESS_TOKEN_TTL;
  const refreshTokenTtl = options.refreshTokenTtl ?? DEFAULT_REFRESH_TOKEN_TTL;

  // Test credentials from environment or defaults
  const testUser = process.env.OAUTH_TEST_USER ?? DEFAULT_TEST_USER;
  const testPassword = process.env.OAUTH_TEST_PASSWORD ?? DEFAULT_TEST_PASSWORD;

  // =========================================================================
  // Validate OAuth parameters (shared between GET /authorize and POST /login)
  // =========================================================================
  function validateOAuthParams(
    query: AuthorizeQueryParams,
    res: Response
  ): { valid: false } | { valid: true; params: Required<Omit<AuthorizeQueryParams, 'scope'>> & { scope: string } } {
    const responseType = query.response_type;
    const reqClientId = query.client_id;
    const redirectUri = query.redirect_uri;
    const scope = query.scope ?? DEFAULT_SCOPE;
    const state = query.state;
    const codeChallenge = query.code_challenge;
    const codeChallengeMethod = query.code_challenge_method;

    // Validate response_type
    if (responseType !== 'code') {
      if (redirectUri && redirectUri === allowedRedirectUri) {
        authorizationError(res, redirectUri, state, 'unsupported_response_type', 'Only response_type=code is supported');
      } else {
        oauthError(res, 400, 'unsupported_response_type', 'Only response_type=code is supported');
      }
      return { valid: false };
    }

    // Validate client_id
    if (reqClientId !== clientId) {
      oauthError(res, 400, 'invalid_client', 'Unknown client_id');
      return { valid: false };
    }

    // Validate redirect_uri
    if (!redirectUri || redirectUri !== allowedRedirectUri) {
      oauthError(res, 400, 'invalid_request', 'Invalid or missing redirect_uri');
      return { valid: false };
    }

    // Validate state is present
    if (!state) {
      authorizationError(res, redirectUri, undefined, 'invalid_request', 'Missing state parameter');
      return { valid: false };
    }

    // Validate PKCE parameters
    if (!codeChallenge) {
      authorizationError(res, redirectUri, state, 'invalid_request', 'Missing code_challenge (PKCE required)');
      return { valid: false };
    }

    // Only allow S256 method per MCP spec
    if (codeChallengeMethod !== 'S256') {
      authorizationError(res, redirectUri, state, 'invalid_request', "code_challenge_method must be 'S256'");
      return { valid: false };
    }

    return {
      valid: true,
      params: {
        response_type: responseType,
        client_id: reqClientId,
        redirect_uri: redirectUri,
        scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
      },
    };
  }

  // =========================================================================
  // GET /authorize - Authorization Endpoint (shows login form)
  // =========================================================================
  router.get('/authorize', (req: Request, res: Response) => {
    const query = req.query as AuthorizeQueryParams;

    // Validate OAuth parameters first
    const validation = validateOAuthParams(query, res);
    if (!validation.valid) {
      return; // Response already sent
    }

    // Show login form with original query string preserved
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const html = renderLoginPage({ queryString });
    res.type('html').send(html);
  });

  // =========================================================================
  // POST /login - Handle login form submission
  // =========================================================================
  router.post('/login', (req: Request, res: Response) => {
    const query = req.query as AuthorizeQueryParams;
    const { username, password } = req.body as { username?: string; password?: string };

    // Validate OAuth parameters
    const validation = validateOAuthParams(query, res);
    if (!validation.valid) {
      return; // Response already sent
    }

    const { params } = validation;
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();

    // Validate credentials
    if (!username || !password) {
      const html = renderLoginPage({ queryString, error: 'Username and password are required' });
      res.type('html').send(html);
      return;
    }

    if (username !== testUser || password !== testPassword) {
      const html = renderLoginPage({ queryString, error: 'Invalid username or password' });
      res.type('html').send(html);
      return;
    }

    // Credentials valid - generate authorization code
    const code = store.storeAuthorizationCode({
      clientId: params.client_id,
      redirectUri: params.redirect_uri,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: 'S256',
      subject: username, // Use actual username as subject
      scope: params.scope,
      state: params.state,
    });

    // Redirect back with authorization code
    const callbackUrl = new URL(params.redirect_uri);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('state', params.state);

    res.redirect(302, callbackUrl.toString());
  });

  // =========================================================================
  // POST /token - Token Endpoint
  // =========================================================================
  router.post('/token', async (req: Request, res: Response) => {
    const body = req.body as TokenRequestBody;

    const grantType = body.grant_type;
    const reqClientId = body.client_id;

    // Validate client_id
    if (reqClientId !== clientId) {
      oauthError(res, 401, 'invalid_client', 'Unknown client_id');
      return;
    }

    if (grantType === 'authorization_code') {
      await handleAuthorizationCodeGrant(
        req,
        res,
        store,
        jwtIssuer,
        accessTokenTtl,
        refreshTokenTtl
      );
    } else if (grantType === 'refresh_token') {
      await handleRefreshTokenGrant(
        req,
        res,
        store,
        jwtIssuer,
        accessTokenTtl,
        refreshTokenTtl
      );
    } else {
      oauthError(res, 400, 'unsupported_grant_type', 'Supported: authorization_code, refresh_token');
    }
  });

  return router;
}

// =============================================================================
// Grant Type Handlers
// =============================================================================

/**
 * Handle authorization_code grant
 */
async function handleAuthorizationCodeGrant(
  req: Request,
  res: Response,
  store: OAuthStore,
  jwtIssuer: JwtIssuer,
  accessTokenTtl: number,
  refreshTokenTtl: number
): Promise<void> {
  const body = req.body as TokenRequestBody;

  const code = body.code;
  const redirectUri = body.redirect_uri;
  const codeVerifier = body.code_verifier;

  // Validate required parameters
  if (!code) {
    oauthError(res, 400, 'invalid_request', 'Missing code parameter');
    return;
  }

  if (!redirectUri) {
    oauthError(res, 400, 'invalid_request', 'Missing redirect_uri parameter');
    return;
  }

  if (!codeVerifier) {
    oauthError(res, 400, 'invalid_request', 'Missing code_verifier parameter');
    return;
  }

  // Consume the authorization code (single-use)
  const codeEntry = store.consumeAuthorizationCode(code);
  if (!codeEntry) {
    oauthError(res, 400, 'invalid_grant', 'Authorization code is invalid or expired');
    return;
  }

  // Validate redirect_uri matches
  if (redirectUri !== codeEntry.redirectUri) {
    oauthError(res, 400, 'invalid_grant', 'redirect_uri does not match');
    return;
  }

  // Verify PKCE code_verifier (timing-safe comparison)
  const pkceValid = await verifyCodeChallenge(
    codeVerifier,
    codeEntry.codeChallenge,
    codeEntry.codeChallengeMethod
  );

  if (!pkceValid) {
    oauthError(res, 400, 'invalid_grant', 'PKCE verification failed');
    return;
  }

  // Issue tokens
  const accessToken = await jwtIssuer.issueAccessToken(
    {
      sub: codeEntry.subject,
      aud: codeEntry.clientId,
      scope: codeEntry.scope,
    },
    accessTokenTtl
  );

  const refreshToken = store.storeRefreshToken(
    {
      clientId: codeEntry.clientId,
      subject: codeEntry.subject,
      scope: codeEntry.scope,
    },
    refreshTokenTtl
  );

  // Return token response
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: accessTokenTtl,
    refresh_token: refreshToken,
    scope: codeEntry.scope,
  });
}

/**
 * Handle refresh_token grant
 */
async function handleRefreshTokenGrant(
  req: Request,
  res: Response,
  store: OAuthStore,
  jwtIssuer: JwtIssuer,
  accessTokenTtl: number,
  refreshTokenTtl: number
): Promise<void> {
  const body = req.body as TokenRequestBody;

  const refreshToken = body.refresh_token;

  // Validate required parameters
  if (!refreshToken) {
    oauthError(res, 400, 'invalid_request', 'Missing refresh_token parameter');
    return;
  }

  // Look up refresh token
  const tokenEntry = store.getRefreshToken(refreshToken);
  if (!tokenEntry) {
    oauthError(res, 400, 'invalid_grant', 'Refresh token is invalid or expired');
    return;
  }

  // Issue new access token
  const accessToken = await jwtIssuer.issueAccessToken(
    {
      sub: tokenEntry.subject,
      aud: tokenEntry.clientId,
      scope: tokenEntry.scope,
    },
    accessTokenTtl
  );

  // Optionally rotate refresh token
  // For simplicity, we'll issue a new one and revoke the old
  store.revokeRefreshToken(refreshToken);
  const newRefreshToken = store.storeRefreshToken(
    {
      clientId: tokenEntry.clientId,
      subject: tokenEntry.subject,
      scope: tokenEntry.scope,
    },
    refreshTokenTtl
  );

  // Return token response
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: accessTokenTtl,
    refresh_token: newRefreshToken,
    scope: tokenEntry.scope,
  });
}
