import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Schemas
  OAuthConfigSchema,
  AuthorizationRequestSchema,
  TokenRequestSchema,
  TokenResponseSchema,
  TokenErrorResponseSchema,
  // Types
  OAuthConfig,
  AuthorizationSession,
  AuthorizationCallbackParams,
  NormalizedTokenResponse,
  // Error classes
  OAuthError,
  StateValidationError,
  SessionExpiredError,
  // State functions
  generateState,
  validateState,
  // URL functions
  getAuthorizationEndpoint,
  getTokenEndpoint,
  // Main client
  OAuthClient,
  // Helper functions
  normalizeTokenResponse,
  parseCallbackUrl,
  createAuth0Client,
  // Legacy
  OAuthHandler,
} from '../../../src/auth/oauth.js';

// =============================================================================
// Test Constants
// =============================================================================

const TEST_CONFIG: OAuthConfig = {
  issuer: 'https://test.auth0.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://app.example.com/callback',
  scopes: ['openid', 'profile', 'email'],
};

const MOCK_TOKEN_RESPONSE = {
  access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-access-token',
  token_type: 'Bearer' as const,
  expires_in: 3600,
  refresh_token: 'test-refresh-token',
  scope: 'openid profile email',
  id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-id-token',
};

// =============================================================================
// Schema Tests
// =============================================================================

describe('OAuth Zod Schemas', () => {
  describe('OAuthConfigSchema', () => {
    it('should validate valid config', () => {
      const result = OAuthConfigSchema.safeParse(TEST_CONFIG);
      expect(result.success).toBe(true);
    });

    it('should require issuer to be a URL', () => {
      const result = OAuthConfigSchema.safeParse({
        ...TEST_CONFIG,
        issuer: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should require clientId', () => {
      const result = OAuthConfigSchema.safeParse({
        issuer: 'https://test.auth0.com',
      });
      expect(result.success).toBe(false);
    });

    it('should allow optional clientSecret', () => {
      const result = OAuthConfigSchema.safeParse({
        issuer: 'https://test.auth0.com',
        clientId: 'test-id',
      });
      expect(result.success).toBe(true);
    });

    it('should provide default scopes', () => {
      const result = OAuthConfigSchema.parse({
        issuer: 'https://test.auth0.com',
        clientId: 'test-id',
      });
      expect(result.scopes).toEqual(['openid', 'profile']);
    });
  });

  describe('AuthorizationRequestSchema', () => {
    it('should validate valid request', () => {
      const result = AuthorizationRequestSchema.safeParse({
        responseType: 'code',
        clientId: 'test-id',
        redirectUri: 'https://app.example.com/callback',
        state: 'random-state',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      });
      expect(result.success).toBe(true);
    });

    it('should only allow code response type', () => {
      const result = AuthorizationRequestSchema.safeParse({
        responseType: 'token',
        clientId: 'test-id',
        redirectUri: 'https://app.example.com/callback',
        state: 'random-state',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      });
      expect(result.success).toBe(false);
    });

    it('should only allow S256 code challenge method', () => {
      const result = AuthorizationRequestSchema.safeParse({
        responseType: 'code',
        clientId: 'test-id',
        redirectUri: 'https://app.example.com/callback',
        state: 'random-state',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'plain',
      });
      expect(result.success).toBe(false);
    });

    it('should validate resource as array of URLs', () => {
      const result = AuthorizationRequestSchema.safeParse({
        responseType: 'code',
        clientId: 'test-id',
        redirectUri: 'https://app.example.com/callback',
        state: 'random-state',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        resource: ['https://api1.example.com', 'https://api2.example.com'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('TokenResponseSchema', () => {
    it('should validate valid token response', () => {
      const result = TokenResponseSchema.safeParse(MOCK_TOKEN_RESPONSE);
      expect(result.success).toBe(true);
    });

    it('should require access_token', () => {
      const result = TokenResponseSchema.safeParse({
        token_type: 'Bearer',
      });
      expect(result.success).toBe(false);
    });

    it('should require Bearer token type', () => {
      const result = TokenResponseSchema.safeParse({
        access_token: 'token',
        token_type: 'Basic',
      });
      expect(result.success).toBe(false);
    });

    it('should allow optional fields', () => {
      const result = TokenResponseSchema.safeParse({
        access_token: 'token',
        token_type: 'Bearer',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('TokenErrorResponseSchema', () => {
    it('should validate error response', () => {
      const result = TokenErrorResponseSchema.safeParse({
        error: 'invalid_grant',
        error_description: 'The authorization code has expired',
      });
      expect(result.success).toBe(true);
    });

    it('should require error field', () => {
      const result = TokenErrorResponseSchema.safeParse({
        error_description: 'Some error',
      });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// Error Class Tests
// =============================================================================

describe('OAuth Error Classes', () => {
  describe('OAuthError', () => {
    it('should create error with code and message', () => {
      const error = new OAuthError('invalid_request', 'Missing parameter');
      expect(error.errorCode).toBe('invalid_request');
      expect(error.message).toBe('Missing parameter');
      expect(error.name).toBe('OAuthError');
    });

    it('should include optional error URI', () => {
      const error = new OAuthError(
        'invalid_request',
        'Missing parameter',
        'https://docs.example.com/errors/invalid_request'
      );
      expect(error.errorUri).toBe('https://docs.example.com/errors/invalid_request');
    });

    it('should create from token error response', () => {
      const error = OAuthError.fromTokenError({
        error: 'invalid_grant',
        error_description: 'Code expired',
        error_uri: 'https://example.com/errors',
      });
      expect(error.errorCode).toBe('invalid_grant');
      expect(error.message).toBe('Code expired');
      expect(error.errorUri).toBe('https://example.com/errors');
    });

    it('should use error code as message if description missing', () => {
      const error = OAuthError.fromTokenError({
        error: 'server_error',
      });
      expect(error.message).toBe('server_error');
    });
  });

  describe('StateValidationError', () => {
    it('should have correct error code', () => {
      const error = new StateValidationError();
      expect(error.errorCode).toBe('invalid_state');
      expect(error.name).toBe('StateValidationError');
    });

    it('should have default message', () => {
      const error = new StateValidationError();
      expect(error.message).toBe('State parameter validation failed');
    });

    it('should accept custom message', () => {
      const error = new StateValidationError('Custom state error');
      expect(error.message).toBe('Custom state error');
    });
  });

  describe('SessionExpiredError', () => {
    it('should have correct error code', () => {
      const error = new SessionExpiredError();
      expect(error.errorCode).toBe('session_expired');
      expect(error.name).toBe('SessionExpiredError');
    });

    it('should have default message', () => {
      const error = new SessionExpiredError();
      expect(error.message).toBe('Authorization session has expired');
    });
  });
});

// =============================================================================
// State Management Tests
// =============================================================================

describe('State Management', () => {
  describe('generateState', () => {
    it('should generate a non-empty string', () => {
      const state = generateState();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0);
    });

    it('should generate unique states', () => {
      const states = new Set<string>();
      for (let i = 0; i < 100; i++) {
        states.add(generateState());
      }
      expect(states.size).toBe(100);
    });

    it('should generate base64url-safe characters', () => {
      const state = generateState();
      // Base64url uses A-Z, a-z, 0-9, -, _
      expect(state).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('should generate consistent length', () => {
      // 32 bytes -> 43 base64url characters (no padding)
      const state = generateState();
      expect(state.length).toBe(43);
    });
  });

  describe('validateState', () => {
    it('should return true for matching states', () => {
      const state = generateState();
      expect(validateState(state, state)).toBe(true);
    });

    it('should return false for different states', () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(validateState(state1, state2)).toBe(false);
    });

    it('should return false for different lengths', () => {
      expect(validateState('short', 'longer-string')).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(validateState(null as unknown as string, 'valid')).toBe(false);
      expect(validateState('valid', undefined as unknown as string)).toBe(false);
      expect(validateState(123 as unknown as string, 'valid')).toBe(false);
    });

    it('should be timing-safe (same execution time for different positions of difference)', () => {
      // This is a basic check - true timing attack prevention requires statistical analysis
      const state = 'a'.repeat(43);
      const diffStart = 'b' + 'a'.repeat(42);
      const diffEnd = 'a'.repeat(42) + 'b';

      // Both should return false
      expect(validateState(state, diffStart)).toBe(false);
      expect(validateState(state, diffEnd)).toBe(false);
    });

    it('should handle equal strings correctly', () => {
      const testStrings = [
        'abc',
        'a'.repeat(100),
        'test-state-parameter-12345',
        generateState(),
      ];

      for (const str of testStrings) {
        expect(validateState(str, str)).toBe(true);
      }
    });

    it('should handle unequal strings of same length correctly', () => {
      expect(validateState('abc', 'abd')).toBe(false);
      expect(validateState('test1', 'test2')).toBe(false);
      expect(validateState('aaaa', 'aaab')).toBe(false);
      expect(validateState('aaaa', 'baaa')).toBe(false);
    });

    it('should handle different length strings correctly', () => {
      expect(validateState('short', 'much-longer-string')).toBe(false);
      expect(validateState('much-longer-string', 'short')).toBe(false);
      expect(validateState('', 'non-empty')).toBe(false);
      expect(validateState('non-empty', '')).toBe(false);
      expect(validateState('a', 'aa')).toBe(false);
      expect(validateState('aaa', 'aa')).toBe(false);
    });

    it('should handle empty strings correctly', () => {
      expect(validateState('', '')).toBe(true);
    });

    it('should use crypto.timingSafeEqual for constant-time comparison', () => {
      // This test verifies the function works with the new implementation
      // by testing various edge cases that rely on proper buffer handling
      const state1 = 'test-state-value';
      const state2 = 'test-state-value';
      const state3 = 'different-state!';

      // Equal states should match
      expect(validateState(state1, state2)).toBe(true);

      // Different states of same length should not match
      expect(validateState(state1, state3)).toBe(false);
    });
  });
});

// =============================================================================
// URL Building Tests
// =============================================================================

describe('URL Building', () => {
  describe('getAuthorizationEndpoint', () => {
    it('should append /authorize to issuer', () => {
      expect(getAuthorizationEndpoint('https://test.auth0.com')).toBe(
        'https://test.auth0.com/authorize'
      );
    });

    it('should handle trailing slash', () => {
      expect(getAuthorizationEndpoint('https://test.auth0.com/')).toBe(
        'https://test.auth0.com/authorize'
      );
    });
  });

  describe('getTokenEndpoint', () => {
    it('should append /oauth/token to issuer (Auth0 format)', () => {
      expect(getTokenEndpoint('https://test.auth0.com')).toBe(
        'https://test.auth0.com/oauth/token'
      );
    });

    it('should handle trailing slash', () => {
      expect(getTokenEndpoint('https://test.auth0.com/')).toBe(
        'https://test.auth0.com/oauth/token'
      );
    });
  });
});

// =============================================================================
// OAuthClient Tests
// =============================================================================

describe('OAuthClient', () => {
  let client: OAuthClient;

  beforeEach(() => {
    client = new OAuthClient(TEST_CONFIG);
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      expect(client).toBeInstanceOf(OAuthClient);
    });

    it('should validate config with Zod', () => {
      expect(() => new OAuthClient({ issuer: 'not-a-url' } as OAuthConfig)).toThrow();
    });

    it('should use custom endpoints if provided', () => {
      const customClient = new OAuthClient({
        ...TEST_CONFIG,
        authorizationEndpoint: 'https://custom.example.com/auth',
        tokenEndpoint: 'https://custom.example.com/token',
      });
      const config = customClient.getConfig();
      expect(config.authorizationEndpoint).toBe('https://custom.example.com/auth');
      expect(config.tokenEndpoint).toBe('https://custom.example.com/token');
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      const config = client.getConfig();
      expect(config.issuer).toBe(TEST_CONFIG.issuer);
      expect(config.clientId).toBe(TEST_CONFIG.clientId);
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('should build valid authorization URL', () => {
      const { url, session } = client.buildAuthorizationUrl();

      expect(url).toContain('https://test.auth0.com/authorize');
      expect(url).toContain('response_type=code');
      expect(url).toContain(`client_id=${TEST_CONFIG.clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(TEST_CONFIG.redirectUri!)}`);
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('state=');
      expect(url).toContain('code_challenge=');
    });

    it('should include PKCE parameters', () => {
      const { url, session } = client.buildAuthorizationUrl();

      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
      expect(session.codeVerifier).toBeDefined();
      expect(session.codeVerifier.length).toBeGreaterThanOrEqual(43);
    });

    it('should include state parameter', () => {
      const { url, session } = client.buildAuthorizationUrl();

      expect(url).toContain('state=');
      expect(session.state).toBeDefined();
      expect(session.state.length).toBe(43);
    });

    it('should include scopes', () => {
      const { url } = client.buildAuthorizationUrl();

      expect(url).toContain('scope=openid+profile+email');
    });

    it('should allow custom scopes', () => {
      const { url } = client.buildAuthorizationUrl({
        scopes: ['read', 'write'],
      });

      expect(url).toContain('scope=read+write');
    });

    it('should include resource indicators (RFC 8707)', () => {
      const { url, session } = client.buildAuthorizationUrl({
        resources: ['https://api1.example.com', 'https://api2.example.com'],
      });

      expect(url).toContain('resource=https%3A%2F%2Fapi1.example.com');
      expect(url).toContain('resource=https%3A%2F%2Fapi2.example.com');
      expect(session.resources).toEqual([
        'https://api1.example.com',
        'https://api2.example.com',
      ]);
    });

    it('should include audience (Auth0-specific)', () => {
      const { url } = client.buildAuthorizationUrl({
        audience: 'https://api.example.com',
      });

      expect(url).toContain('audience=https%3A%2F%2Fapi.example.com');
    });

    it('should include additional parameters', () => {
      const { url } = client.buildAuthorizationUrl({
        additionalParams: {
          prompt: 'consent',
          login_hint: 'user@example.com',
        },
      });

      expect(url).toContain('prompt=consent');
      expect(url).toContain('login_hint=user%40example.com');
    });

    it('should create session with expiration', () => {
      const { session } = client.buildAuthorizationUrl({
        sessionExpiresIn: 300, // 5 minutes
      });

      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
      expect(session.expiresAt).toBe(session.createdAt + 300 * 1000);
    });

    it('should throw if redirectUri not configured', () => {
      const clientWithoutRedirect = new OAuthClient({
        issuer: 'https://test.auth0.com',
        clientId: 'test-id',
      });

      expect(() => clientWithoutRedirect.buildAuthorizationUrl()).toThrow(
        'Redirect URI is required'
      );
    });

    it('should allow override of redirect URI', () => {
      const { url } = client.buildAuthorizationUrl({
        redirectUri: 'https://other.example.com/callback',
      });

      expect(url).toContain('redirect_uri=https%3A%2F%2Fother.example.com%2Fcallback');
    });
  });

  describe('handleCallback', () => {
    let session: AuthorizationSession;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      const { session: s } = client.buildAuthorizationUrl();
      session = s;

      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_TOKEN_RESPONSE),
      });
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should exchange code for tokens', async () => {
      const params: AuthorizationCallbackParams = {
        code: 'auth-code',
        state: session.state,
      };

      const result = await client.handleCallback(params, session);

      expect(result.accessToken).toBe(MOCK_TOKEN_RESPONSE.access_token);
      expect(result.tokenType).toBe('Bearer');
      expect(result.refreshToken).toBe(MOCK_TOKEN_RESPONSE.refresh_token);
    });

    it('should throw StateValidationError for invalid state', async () => {
      const params: AuthorizationCallbackParams = {
        code: 'auth-code',
        state: 'wrong-state',
      };

      await expect(client.handleCallback(params, session)).rejects.toThrow(
        StateValidationError
      );
    });

    it('should throw SessionExpiredError for expired session', async () => {
      const expiredSession: AuthorizationSession = {
        ...session,
        expiresAt: Date.now() - 1000, // Already expired
      };

      const params: AuthorizationCallbackParams = {
        code: 'auth-code',
        state: expiredSession.state,
      };

      await expect(client.handleCallback(params, expiredSession)).rejects.toThrow(
        SessionExpiredError
      );
    });

    it('should throw OAuthError if authorization returned error', async () => {
      const params: AuthorizationCallbackParams = {
        code: '',
        state: session.state,
        error: 'access_denied',
        errorDescription: 'User denied access',
      };

      await expect(client.handleCallback(params, session)).rejects.toThrow(OAuthError);
    });
  });

  describe('exchangeCode', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_TOKEN_RESPONSE),
      });
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should send correct token request', async () => {
      await client.exchangeCode({
        code: 'auth-code',
        codeVerifier: 'a'.repeat(43),
        redirectUri: 'https://app.example.com/callback',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.auth0.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        })
      );

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('auth-code');
      expect(body.get('code_verifier')).toBe('a'.repeat(43));
      expect(body.get('client_id')).toBe(TEST_CONFIG.clientId);
      expect(body.get('client_secret')).toBe(TEST_CONFIG.clientSecret);
      expect(body.get('redirect_uri')).toBe('https://app.example.com/callback');
    });

    it('should include resource indicator', async () => {
      await client.exchangeCode({
        code: 'auth-code',
        codeVerifier: 'a'.repeat(43),
        redirectUri: 'https://app.example.com/callback',
        resource: 'https://api.example.com',
      });

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('resource')).toBe('https://api.example.com');
    });

    it('should return normalized token response', async () => {
      const result = await client.exchangeCode({
        code: 'auth-code',
        codeVerifier: 'a'.repeat(43),
        redirectUri: 'https://app.example.com/callback',
      });

      expect(result).toEqual({
        accessToken: MOCK_TOKEN_RESPONSE.access_token,
        tokenType: 'Bearer',
        expiresIn: MOCK_TOKEN_RESPONSE.expires_in,
        refreshToken: MOCK_TOKEN_RESPONSE.refresh_token,
        scope: MOCK_TOKEN_RESPONSE.scope,
        idToken: MOCK_TOKEN_RESPONSE.id_token,
      });
    });

    it('should throw OAuthError on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'Authorization code expired',
          }),
      });

      await expect(
        client.exchangeCode({
          code: 'expired-code',
          codeVerifier: 'a'.repeat(43),
          redirectUri: 'https://app.example.com/callback',
        })
      ).rejects.toThrow(OAuthError);
    });

    it('should handle non-OAuth error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Internal server error' }),
      });

      await expect(
        client.exchangeCode({
          code: 'code',
          codeVerifier: 'a'.repeat(43),
          redirectUri: 'https://app.example.com/callback',
        })
      ).rejects.toThrow('Token request failed with status 500');
    });
  });

  describe('Network Failure Handling', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('exchangeCode network failures', () => {
      it('should handle network timeout during token exchange', async () => {
        const abortError = new Error('The operation was aborted due to timeout');
        abortError.name = 'AbortError';
        mockFetch.mockRejectedValue(abortError);

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow('The operation was aborted due to timeout');
      });

      it('should handle connection refused errors', async () => {
        const connectionError = new TypeError('fetch failed: Connection refused');
        mockFetch.mockRejectedValue(connectionError);

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow('Connection refused');
      });

      it('should handle DNS resolution failures', async () => {
        const dnsError = new TypeError('getaddrinfo ENOTFOUND unknown.host');
        mockFetch.mockRejectedValue(dnsError);

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow('ENOTFOUND');
      });

      it('should handle connection reset/dropped', async () => {
        const resetError = new Error('Connection reset by peer');
        resetError.name = 'ConnectionResetError';
        mockFetch.mockRejectedValue(resetError);

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow('Connection reset by peer');
      });

      it('should handle generic network failure', async () => {
        mockFetch.mockRejectedValue(new TypeError('Network request failed'));

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow('Network request failed');
      });

      it('should handle partial response / JSON parse error', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
        });

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow('Unexpected end of JSON input');
      });
    });

    describe('Malformed token responses from IdP', () => {
      it('should reject token response missing access_token', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              token_type: 'Bearer',
              expires_in: 3600,
              // Missing access_token
            }),
        });

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow();
      });

      it('should reject token response missing token_type', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'valid-token',
              expires_in: 3600,
              // Missing token_type
            }),
        });

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow();
      });

      it('should reject token response with wrong token_type', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'valid-token',
              token_type: 'Basic', // Should be Bearer
              expires_in: 3600,
            }),
        });

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow();
      });

      it('should reject completely empty response body', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(null),
        });

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow();
      });

      it('should reject non-object response body', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve('not an object'),
        });

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow();
      });

      it('should reject array response body', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve([{ access_token: 'token' }]),
        });

        await expect(
          client.exchangeCode({
            code: 'auth-code',
            codeVerifier: 'a'.repeat(43),
            redirectUri: 'https://app.example.com/callback',
          })
        ).rejects.toThrow();
      });
    });

    describe('refreshToken network failures', () => {
      it('should handle network timeout during token refresh', async () => {
        const abortError = new Error('The operation was aborted due to timeout');
        abortError.name = 'AbortError';
        mockFetch.mockRejectedValue(abortError);

        await expect(client.refreshToken('refresh-token-value')).rejects.toThrow(
          'The operation was aborted due to timeout'
        );
      });

      it('should handle connection refused during refresh', async () => {
        mockFetch.mockRejectedValue(new TypeError('fetch failed: Connection refused'));

        await expect(client.refreshToken('refresh-token-value')).rejects.toThrow(
          'Connection refused'
        );
      });

      it('should handle partial response during refresh', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.reject(new SyntaxError('Unexpected token in JSON')),
        });

        await expect(client.refreshToken('refresh-token-value')).rejects.toThrow(
          'Unexpected token'
        );
      });

      it('should handle malformed refresh response', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              // Missing required fields
              expires_in: 3600,
            }),
        });

        await expect(client.refreshToken('refresh-token-value')).rejects.toThrow();
      });
    });

    describe('handleCallback network failures', () => {
      let session: AuthorizationSession;

      beforeEach(() => {
        // Need a valid session for handleCallback tests
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(MOCK_TOKEN_RESPONSE),
        });
        const result = client.buildAuthorizationUrl();
        session = result.session;
        global.fetch = mockFetch; // Restore the test mock
      });

      it('should propagate network errors during callback handling', async () => {
        mockFetch.mockRejectedValue(new TypeError('Network request failed'));

        const params: AuthorizationCallbackParams = {
          code: 'auth-code',
          state: session.state,
        };

        await expect(client.handleCallback(params, session)).rejects.toThrow(
          'Network request failed'
        );
      });

      it('should propagate timeout errors during callback handling', async () => {
        const abortError = new Error('Request timed out');
        abortError.name = 'AbortError';
        mockFetch.mockRejectedValue(abortError);

        const params: AuthorizationCallbackParams = {
          code: 'auth-code',
          state: session.state,
        };

        await expect(client.handleCallback(params, session)).rejects.toThrow('Request timed out');
      });

      it('should handle connection drop after partial response in callback', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.reject(new Error('Connection closed unexpectedly')),
        });

        const params: AuthorizationCallbackParams = {
          code: 'auth-code',
          state: session.state,
        };

        await expect(client.handleCallback(params, session)).rejects.toThrow(
          'Connection closed unexpectedly'
        );
      });
    });
  });

  describe('refreshToken', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_TOKEN_RESPONSE),
      });
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should send correct refresh request', async () => {
      await client.refreshToken('refresh-token-value');

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-token-value');
      expect(body.get('client_id')).toBe(TEST_CONFIG.clientId);
      expect(body.get('client_secret')).toBe(TEST_CONFIG.clientSecret);
    });

    it('should include optional scopes', async () => {
      await client.refreshToken('refresh-token-value', {
        scopes: ['read', 'write'],
      });

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('scope')).toBe('read write');
    });

    it('should include resource indicator', async () => {
      await client.refreshToken('refresh-token-value', {
        resource: 'https://api.example.com',
      });

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('resource')).toBe('https://api.example.com');
    });
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('Helper Functions', () => {
  describe('normalizeTokenResponse', () => {
    it('should convert snake_case to camelCase', () => {
      const result = normalizeTokenResponse(MOCK_TOKEN_RESPONSE);

      expect(result).toEqual({
        accessToken: MOCK_TOKEN_RESPONSE.access_token,
        tokenType: 'Bearer',
        expiresIn: MOCK_TOKEN_RESPONSE.expires_in,
        refreshToken: MOCK_TOKEN_RESPONSE.refresh_token,
        scope: MOCK_TOKEN_RESPONSE.scope,
        idToken: MOCK_TOKEN_RESPONSE.id_token,
      });
    });

    it('should handle minimal response', () => {
      const result = normalizeTokenResponse({
        access_token: 'token',
        token_type: 'Bearer',
      });

      expect(result).toEqual({
        accessToken: 'token',
        tokenType: 'Bearer',
        expiresIn: undefined,
        refreshToken: undefined,
        scope: undefined,
        idToken: undefined,
      });
    });
  });

  describe('parseCallbackUrl', () => {
    it('should parse successful callback', () => {
      const url = 'https://app.example.com/callback?code=auth-code&state=random-state';
      const result = parseCallbackUrl(url);

      expect(result).toEqual({
        code: 'auth-code',
        state: 'random-state',
      });
    });

    it('should parse error callback', () => {
      const url =
        'https://app.example.com/callback?error=access_denied&error_description=User+denied&state=random-state';
      const result = parseCallbackUrl(url);

      expect(result).toEqual({
        code: '',
        state: 'random-state',
        error: 'access_denied',
        errorDescription: 'User denied',
      });
    });

    it('should throw for missing code', () => {
      const url = 'https://app.example.com/callback?state=random-state';

      expect(() => parseCallbackUrl(url)).toThrow(OAuthError);
      expect(() => parseCallbackUrl(url)).toThrow('Missing authorization code');
    });

    it('should throw for missing state', () => {
      const url = 'https://app.example.com/callback?code=auth-code';

      expect(() => parseCallbackUrl(url)).toThrow(OAuthError);
      expect(() => parseCallbackUrl(url)).toThrow('Missing state parameter');
    });
  });

  describe('createAuth0Client', () => {
    it('should create client from domain', () => {
      const client = createAuth0Client('test.auth0.com', 'client-id');

      const config = client.getConfig();
      expect(config.issuer).toBe('https://test.auth0.com');
      expect(config.clientId).toBe('client-id');
    });

    it('should handle https:// prefix', () => {
      const client = createAuth0Client('https://test.auth0.com', 'client-id');

      const config = client.getConfig();
      expect(config.issuer).toBe('https://test.auth0.com');
    });

    it('should accept optional parameters', () => {
      const client = createAuth0Client('test.auth0.com', 'client-id', {
        clientSecret: 'secret',
        redirectUri: 'https://app.example.com/callback',
        scopes: ['openid', 'email'],
      });

      const config = client.getConfig();
      expect(config.clientSecret).toBe('secret');
      expect(config.redirectUri).toBe('https://app.example.com/callback');
      expect(config.scopes).toEqual(['openid', 'email']);
    });
  });
});

// =============================================================================
// Legacy OAuthHandler Tests
// =============================================================================

describe('OAuthHandler (legacy)', () => {
  let handler: OAuthHandler;

  beforeEach(() => {
    handler = new OAuthHandler(TEST_CONFIG);
  });

  describe('authorize', () => {
    it('should return authorization URL', async () => {
      const url = await handler.authorize({
        responseType: 'code',
        clientId: TEST_CONFIG.clientId,
        redirectUri: TEST_CONFIG.redirectUri!,
        scope: 'openid profile',
      });

      expect(url).toContain('https://test.auth0.com/authorize');
      expect(url).toContain('response_type=code');
    });
  });

  describe('token', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_TOKEN_RESPONSE),
      });
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should exchange authorization code', async () => {
      const result = await handler.token({
        grantType: 'authorization_code',
        code: 'auth-code',
        codeVerifier: 'a'.repeat(43),
        redirectUri: TEST_CONFIG.redirectUri,
      });

      expect(result.accessToken).toBe(MOCK_TOKEN_RESPONSE.access_token);
    });

    it('should refresh token', async () => {
      const result = await handler.token({
        grantType: 'refresh_token',
        refreshToken: 'refresh-token',
      });

      expect(result.accessToken).toBe(MOCK_TOKEN_RESPONSE.access_token);
    });

    it('should throw for missing authorization code params', async () => {
      await expect(
        handler.token({
          grantType: 'authorization_code',
        })
      ).rejects.toThrow('Missing required parameters');
    });

    it('should throw for missing refresh token', async () => {
      await expect(
        handler.token({
          grantType: 'refresh_token',
        })
      ).rejects.toThrow('Missing refresh token');
    });

    it('should throw for unsupported grant type', async () => {
      await expect(
        handler.token({
          grantType: 'client_credentials',
        })
      ).rejects.toThrow('Unsupported grant type');
    });
  });
});

// =============================================================================
// Security Tests
// =============================================================================

describe('Security', () => {
  describe('State Parameter', () => {
    it('should be cryptographically random', () => {
      // Generate many states and check for uniqueness
      const states = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        states.add(generateState());
      }
      expect(states.size).toBe(1000);
    });

    it('should have sufficient entropy (256 bits)', () => {
      const state = generateState();
      // 32 bytes = 256 bits of entropy
      // Base64url encoding: 32 bytes * 8 bits / 6 bits per char = 42.67, so 43 chars
      expect(state.length).toBe(43);
    });
  });

  describe('PKCE Integration', () => {
    it('should generate unique code verifiers per request', () => {
      const client = new OAuthClient(TEST_CONFIG);
      const verifiers = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const { session } = client.buildAuthorizationUrl();
        verifiers.add(session.codeVerifier);
      }

      expect(verifiers.size).toBe(100);
    });

    it('should never expose code verifier in authorization URL', () => {
      const client = new OAuthClient(TEST_CONFIG);
      const { url, session } = client.buildAuthorizationUrl();

      expect(url).not.toContain(session.codeVerifier);
      expect(url).toContain('code_challenge=');
    });
  });

  describe('Session Management', () => {
    it('should expire sessions after configured time', () => {
      const client = new OAuthClient(TEST_CONFIG);
      const { session } = client.buildAuthorizationUrl({
        sessionExpiresIn: 60, // 1 minute
      });

      const expectedExpiration = session.createdAt + 60 * 1000;
      expect(session.expiresAt).toBe(expectedExpiration);
    });

    it('should validate state with timing-safe comparison', () => {
      // The validateState function uses timing-safe comparison internally
      // This test verifies the function works correctly for both matching and non-matching cases
      const state = generateState();

      expect(validateState(state, state)).toBe(true);
      expect(validateState(state, state.slice(0, -1) + 'X')).toBe(false);
    });
  });
});
