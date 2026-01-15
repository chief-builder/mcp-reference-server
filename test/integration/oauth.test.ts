/**
 * OAuth Flow Integration Tests
 *
 * Tests OAuth 2.1 Authorization Code flow including:
 * - Authorization URL construction
 * - State parameter validation
 * - Token exchange (mocked auth server)
 * - Token refresh flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OAuthClient,
  OAuthConfig,
  OAuthError,
  StateValidationError,
  SessionExpiredError,
  AuthorizationSession,
  AuthorizationCallbackParams,
  validateState,
  parseCallbackUrl,
  NormalizedTokenResponse,
} from '../../src/auth/oauth.js';

// =============================================================================
// Test Constants
// =============================================================================

const TEST_CONFIG: OAuthConfig = {
  issuer: 'https://auth.example.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://app.example.com/oauth/callback',
  scopes: ['openid', 'profile', 'mcp:tools'],
};

const MOCK_TOKEN_RESPONSE = {
  access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.access',
  token_type: 'Bearer' as const,
  expires_in: 3600,
  refresh_token: 'refresh-token-xyz',
  scope: 'openid profile mcp:tools',
  id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.id',
};

// =============================================================================
// Mock Server Helpers
// =============================================================================

interface MockAuthServer {
  tokenEndpointCalls: Array<{
    body: URLSearchParams;
    headers: Record<string, string>;
  }>;
  setTokenResponse: (response: unknown, status?: number) => void;
  setTokenError: (error: string, description?: string) => void;
  cleanup: () => void;
}

function createMockAuthServer(): MockAuthServer {
  const tokenEndpointCalls: Array<{
    body: URLSearchParams;
    headers: Record<string, string>;
  }> = [];
  let tokenResponse: unknown = MOCK_TOKEN_RESPONSE;
  let tokenStatus = 200;

  const mockFetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    if (url.includes('/oauth/token')) {
      const body = new URLSearchParams(options.body as string);
      const headers: Record<string, string> = {};
      if (options.headers) {
        Object.entries(options.headers).forEach(([k, v]) => {
          headers[k] = v as string;
        });
      }
      tokenEndpointCalls.push({ body, headers });

      return {
        ok: tokenStatus >= 200 && tokenStatus < 300,
        status: tokenStatus,
        json: async () => tokenResponse,
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'not_found' }),
    };
  });

  global.fetch = mockFetch;

  return {
    tokenEndpointCalls,
    setTokenResponse: (response: unknown, status = 200) => {
      tokenResponse = response;
      tokenStatus = status;
    },
    setTokenError: (error: string, description?: string) => {
      tokenResponse = {
        error,
        error_description: description ?? error,
      };
      tokenStatus = 400;
    },
    cleanup: () => {
      vi.restoreAllMocks();
    },
  };
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('OAuth Flow Integration', () => {
  let client: OAuthClient;
  let mockServer: MockAuthServer;

  beforeEach(() => {
    client = new OAuthClient(TEST_CONFIG);
    mockServer = createMockAuthServer();
  });

  afterEach(() => {
    mockServer.cleanup();
  });

  describe('Authorization URL Construction', () => {
    it('should build complete authorization URL with all required parameters', () => {
      const { url, session } = client.buildAuthorizationUrl();

      const parsedUrl = new URL(url);

      // Verify base URL
      expect(parsedUrl.origin).toBe('https://auth.example.com');
      expect(parsedUrl.pathname).toBe('/authorize');

      // Verify required OAuth 2.1 parameters
      expect(parsedUrl.searchParams.get('response_type')).toBe('code');
      expect(parsedUrl.searchParams.get('client_id')).toBe(TEST_CONFIG.clientId);
      expect(parsedUrl.searchParams.get('redirect_uri')).toBe(TEST_CONFIG.redirectUri);

      // Verify PKCE parameters
      expect(parsedUrl.searchParams.get('code_challenge')).toBeTruthy();
      expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256');

      // Verify state for CSRF protection
      expect(parsedUrl.searchParams.get('state')).toBe(session.state);

      // Verify scopes
      expect(parsedUrl.searchParams.get('scope')).toBe('openid profile mcp:tools');
    });

    it('should generate unique PKCE verifier and state for each request', () => {
      const requests = Array.from({ length: 10 }, () => client.buildAuthorizationUrl());

      const verifiers = new Set(requests.map((r) => r.session.codeVerifier));
      const states = new Set(requests.map((r) => r.session.state));

      expect(verifiers.size).toBe(10);
      expect(states.size).toBe(10);
    });

    it('should support resource indicators (RFC 8707)', () => {
      const { url, session } = client.buildAuthorizationUrl({
        resources: [
          'https://api1.example.com',
          'https://api2.example.com',
        ],
      });

      const parsedUrl = new URL(url);
      const resources = parsedUrl.searchParams.getAll('resource');

      expect(resources).toContain('https://api1.example.com');
      expect(resources).toContain('https://api2.example.com');
      expect(session.resources).toEqual([
        'https://api1.example.com',
        'https://api2.example.com',
      ]);
    });

    it('should support audience parameter (Auth0)', () => {
      const { url } = client.buildAuthorizationUrl({
        audience: 'https://api.example.com',
      });

      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('audience')).toBe('https://api.example.com');
    });

    it('should include custom additional parameters', () => {
      const { url } = client.buildAuthorizationUrl({
        additionalParams: {
          prompt: 'consent',
          login_hint: 'user@example.com',
          acr_values: 'urn:mace:incommon:iap:silver',
        },
      });

      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('prompt')).toBe('consent');
      expect(parsedUrl.searchParams.get('login_hint')).toBe('user@example.com');
      expect(parsedUrl.searchParams.get('acr_values')).toBe('urn:mace:incommon:iap:silver');
    });

    it('should create session with expiration time', () => {
      const { session } = client.buildAuthorizationUrl({
        sessionExpiresIn: 300, // 5 minutes
      });

      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
      expect(session.expiresAt).toBe(session.createdAt + 300 * 1000);
    });
  });

  describe('State Parameter Validation', () => {
    it('should validate matching state parameters', () => {
      const { session } = client.buildAuthorizationUrl();
      expect(validateState(session.state, session.state)).toBe(true);
    });

    it('should reject mismatched state parameters', () => {
      const { session: session1 } = client.buildAuthorizationUrl();
      const { session: session2 } = client.buildAuthorizationUrl();

      expect(validateState(session1.state, session2.state)).toBe(false);
    });

    it('should reject tampered state parameters', () => {
      const { session } = client.buildAuthorizationUrl();
      const tamperedState = session.state.slice(0, -1) + 'X';

      expect(validateState(tamperedState, session.state)).toBe(false);
    });

    it('should handle edge cases gracefully', () => {
      expect(validateState('', '')).toBe(true);
      expect(validateState('a', 'b')).toBe(false);
      expect(validateState('short', 'longer')).toBe(false);
    });
  });

  describe('Token Exchange Flow', () => {
    it('should exchange authorization code for tokens', async () => {
      const { session } = client.buildAuthorizationUrl();

      const params: AuthorizationCallbackParams = {
        code: 'auth-code-xyz',
        state: session.state,
      };

      const result = await client.handleCallback(params, session);

      // Verify token response
      expect(result.accessToken).toBe(MOCK_TOKEN_RESPONSE.access_token);
      expect(result.tokenType).toBe('Bearer');
      expect(result.refreshToken).toBe(MOCK_TOKEN_RESPONSE.refresh_token);
      expect(result.expiresIn).toBe(3600);
      expect(result.idToken).toBe(MOCK_TOKEN_RESPONSE.id_token);

      // Verify token endpoint was called correctly
      expect(mockServer.tokenEndpointCalls).toHaveLength(1);
      const call = mockServer.tokenEndpointCalls[0];
      expect(call.body.get('grant_type')).toBe('authorization_code');
      expect(call.body.get('code')).toBe('auth-code-xyz');
      expect(call.body.get('code_verifier')).toBe(session.codeVerifier);
      expect(call.body.get('redirect_uri')).toBe(session.redirectUri);
      expect(call.body.get('client_id')).toBe(TEST_CONFIG.clientId);
      expect(call.body.get('client_secret')).toBe(TEST_CONFIG.clientSecret);
    });

    it('should include resource indicator in token exchange', async () => {
      const { session } = client.buildAuthorizationUrl({
        resources: ['https://api.example.com'],
      });

      const params: AuthorizationCallbackParams = {
        code: 'auth-code',
        state: session.state,
      };

      await client.handleCallback(params, session);

      const call = mockServer.tokenEndpointCalls[0];
      expect(call.body.get('resource')).toBe('https://api.example.com');
    });

    it('should throw StateValidationError for invalid state', async () => {
      const { session } = client.buildAuthorizationUrl();

      const params: AuthorizationCallbackParams = {
        code: 'auth-code',
        state: 'wrong-state-value',
      };

      await expect(client.handleCallback(params, session)).rejects.toThrow(
        StateValidationError
      );
    });

    it('should throw SessionExpiredError for expired session', async () => {
      const { session } = client.buildAuthorizationUrl({ sessionExpiresIn: 0 });

      // Session is already expired
      const expiredSession: AuthorizationSession = {
        ...session,
        expiresAt: Date.now() - 1000,
      };

      const params: AuthorizationCallbackParams = {
        code: 'auth-code',
        state: expiredSession.state,
      };

      await expect(client.handleCallback(params, expiredSession)).rejects.toThrow(
        SessionExpiredError
      );
    });

    it('should throw OAuthError for authorization error response', async () => {
      const { session } = client.buildAuthorizationUrl();

      const params: AuthorizationCallbackParams = {
        code: '',
        state: session.state,
        error: 'access_denied',
        errorDescription: 'User denied consent',
      };

      await expect(client.handleCallback(params, session)).rejects.toThrow(OAuthError);
    });

    it('should handle token endpoint error responses', async () => {
      mockServer.setTokenError('invalid_grant', 'Authorization code has expired');

      const { session } = client.buildAuthorizationUrl();

      const params: AuthorizationCallbackParams = {
        code: 'expired-code',
        state: session.state,
      };

      await expect(client.handleCallback(params, session)).rejects.toThrow(OAuthError);
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh access token using refresh token', async () => {
      const result = await client.refreshToken('refresh-token-abc');

      expect(result.accessToken).toBe(MOCK_TOKEN_RESPONSE.access_token);
      expect(result.tokenType).toBe('Bearer');

      // Verify refresh request
      expect(mockServer.tokenEndpointCalls).toHaveLength(1);
      const call = mockServer.tokenEndpointCalls[0];
      expect(call.body.get('grant_type')).toBe('refresh_token');
      expect(call.body.get('refresh_token')).toBe('refresh-token-abc');
      expect(call.body.get('client_id')).toBe(TEST_CONFIG.clientId);
    });

    it('should support scope downgrade on refresh', async () => {
      await client.refreshToken('refresh-token', {
        scopes: ['openid', 'profile'], // Subset of original scopes
      });

      const call = mockServer.tokenEndpointCalls[0];
      expect(call.body.get('scope')).toBe('openid profile');
    });

    it('should support resource indicator on refresh', async () => {
      await client.refreshToken('refresh-token', {
        resource: 'https://api.example.com',
      });

      const call = mockServer.tokenEndpointCalls[0];
      expect(call.body.get('resource')).toBe('https://api.example.com');
    });

    it('should handle refresh token expiration', async () => {
      mockServer.setTokenError('invalid_grant', 'Refresh token has expired');

      await expect(client.refreshToken('expired-refresh-token')).rejects.toThrow(
        OAuthError
      );
    });

    it('should handle refresh token rotation', async () => {
      const newRefreshToken = 'new-refresh-token-rotated';
      mockServer.setTokenResponse({
        ...MOCK_TOKEN_RESPONSE,
        refresh_token: newRefreshToken,
      });

      const result = await client.refreshToken('old-refresh-token');

      expect(result.refreshToken).toBe(newRefreshToken);
    });
  });

  describe('Callback URL Parsing', () => {
    it('should parse successful callback URL', () => {
      const callbackUrl =
        'https://app.example.com/callback?code=auth-code-123&state=state-xyz';
      const params = parseCallbackUrl(callbackUrl);

      expect(params.code).toBe('auth-code-123');
      expect(params.state).toBe('state-xyz');
      expect(params.error).toBeUndefined();
    });

    it('should parse error callback URL', () => {
      const callbackUrl =
        'https://app.example.com/callback?error=access_denied&error_description=User+denied&state=state-xyz';
      const params = parseCallbackUrl(callbackUrl);

      expect(params.error).toBe('access_denied');
      expect(params.errorDescription).toBe('User denied');
      expect(params.state).toBe('state-xyz');
    });

    it('should throw for missing code parameter', () => {
      const callbackUrl = 'https://app.example.com/callback?state=state-xyz';

      expect(() => parseCallbackUrl(callbackUrl)).toThrow(OAuthError);
      expect(() => parseCallbackUrl(callbackUrl)).toThrow('Missing authorization code');
    });

    it('should throw for missing state parameter', () => {
      const callbackUrl = 'https://app.example.com/callback?code=auth-code';

      expect(() => parseCallbackUrl(callbackUrl)).toThrow(OAuthError);
      expect(() => parseCallbackUrl(callbackUrl)).toThrow('Missing state parameter');
    });
  });

  describe('Complete OAuth Flow', () => {
    it('should complete full authorization code flow', async () => {
      // Step 1: Build authorization URL
      const { url, session } = client.buildAuthorizationUrl({
        scopes: ['openid', 'profile', 'mcp:tools:execute'],
        resources: ['https://mcp-server.example.com'],
      });

      // Verify URL is well-formed
      const authUrl = new URL(url);
      expect(authUrl.searchParams.get('response_type')).toBe('code');

      // Step 2: Simulate user authorization (callback)
      const callbackUrl = new URL('https://app.example.com/callback');
      callbackUrl.searchParams.set('code', 'authorization-code');
      callbackUrl.searchParams.set('state', session.state);

      // Step 3: Parse callback
      const callbackParams = parseCallbackUrl(callbackUrl.toString());
      expect(callbackParams.code).toBe('authorization-code');

      // Step 4: Exchange code for tokens
      const tokens = await client.handleCallback(callbackParams, session);
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();

      // Step 5: Refresh token
      const refreshedTokens = await client.refreshToken(tokens.refreshToken!);
      expect(refreshedTokens.accessToken).toBeTruthy();
    });

    it('should handle authorization denial gracefully', async () => {
      const { session } = client.buildAuthorizationUrl();

      // User denied authorization
      const callbackUrl = new URL('https://app.example.com/callback');
      callbackUrl.searchParams.set('error', 'access_denied');
      callbackUrl.searchParams.set('error_description', 'User denied the request');
      callbackUrl.searchParams.set('state', session.state);

      const callbackParams = parseCallbackUrl(callbackUrl.toString());

      await expect(client.handleCallback(callbackParams, session)).rejects.toThrow(
        'User denied the request'
      );
    });

    it('should handle CSRF attack attempt', async () => {
      const { session } = client.buildAuthorizationUrl();

      // Attacker tries to use their own state
      const attackerState = 'attacker-controlled-state';
      const callbackUrl = new URL('https://app.example.com/callback');
      callbackUrl.searchParams.set('code', 'stolen-code');
      callbackUrl.searchParams.set('state', attackerState);

      const callbackParams = parseCallbackUrl(callbackUrl.toString());

      // Should reject due to state mismatch
      await expect(client.handleCallback(callbackParams, session)).rejects.toThrow(
        StateValidationError
      );
    });
  });

  describe('Configuration Options', () => {
    it('should use custom endpoints when provided', async () => {
      const customClient = new OAuthClient({
        ...TEST_CONFIG,
        authorizationEndpoint: 'https://custom.example.com/auth',
        tokenEndpoint: 'https://custom.example.com/token',
      });

      const { url, session } = customClient.buildAuthorizationUrl();

      // Authorization URL should use custom endpoint
      expect(url.startsWith('https://custom.example.com/auth')).toBe(true);

      // Create a mock that checks the token endpoint
      const customMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_TOKEN_RESPONSE,
      });
      global.fetch = customMock;

      await customClient.exchangeCode({
        code: 'test-code',
        codeVerifier: session.codeVerifier,
        redirectUri: session.redirectUri,
      });

      // Token request should use custom endpoint
      expect(customMock).toHaveBeenCalledWith(
        'https://custom.example.com/token',
        expect.any(Object)
      );
    });

    it('should work without client secret (public client)', async () => {
      const publicClient = new OAuthClient({
        issuer: 'https://auth.example.com',
        clientId: 'public-client-id',
        redirectUri: 'https://app.example.com/callback',
        // No clientSecret
      });

      const { session } = publicClient.buildAuthorizationUrl();

      await publicClient.exchangeCode({
        code: 'test-code',
        codeVerifier: session.codeVerifier,
        redirectUri: session.redirectUri,
      });

      // Verify no client_secret was sent
      const call = mockServer.tokenEndpointCalls[0];
      expect(call.body.get('client_secret')).toBeNull();
    });
  });
});
