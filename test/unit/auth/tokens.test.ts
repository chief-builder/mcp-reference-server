import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Schemas
  TokenPayloadSchema,
  TokenValidationOptionsSchema,
  IntrospectionResponseSchema,
  TokenManagerConfigSchema,
  // Types
  TokenPayload,
  TokenValidationOptions,
  IntrospectionResponse,
  StoredToken,
  // Error classes
  TokenError,
  TokenExpiredError,
  TokenValidationError,
  TokenRefreshError,
  // Main class
  TokenManager,
  // Standalone functions
  isTokenExpired,
  validateAccessToken,
  refreshAccessToken,
} from '../../../src/auth/tokens.js';
import { OAuthClient, NormalizedTokenResponse } from '../../../src/auth/oauth.js';

// =============================================================================
// Test Constants
// =============================================================================

const NOW = 1704067200000; // 2024-01-01T00:00:00.000Z
const NOW_SECONDS = Math.floor(NOW / 1000);

// Create a valid JWT for testing
function createTestJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'test-signature';
  return `${headerB64}.${payloadB64}.${signature}`;
}

const VALID_PAYLOAD: TokenPayload = {
  sub: 'user-123',
  iss: 'https://test.auth0.com/',
  aud: 'https://api.example.com',
  exp: NOW_SECONDS + 3600, // 1 hour from now
  iat: NOW_SECONDS,
  scope: 'openid profile email',
};

const VALID_JWT = createTestJwt(VALID_PAYLOAD);

const MOCK_TOKEN_RESPONSE: NormalizedTokenResponse = {
  accessToken: VALID_JWT,
  tokenType: 'Bearer',
  expiresIn: 3600,
  refreshToken: 'test-refresh-token',
  scope: 'openid profile email',
};

const TEST_OAUTH_CONFIG = {
  issuer: 'https://test.auth0.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://app.example.com/callback',
};

// =============================================================================
// Schema Tests
// =============================================================================

describe('Token Zod Schemas', () => {
  describe('TokenPayloadSchema', () => {
    it('should validate valid payload', () => {
      const result = TokenPayloadSchema.safeParse(VALID_PAYLOAD);
      expect(result.success).toBe(true);
    });

    it('should require sub', () => {
      const { sub: _, ...withoutSub } = VALID_PAYLOAD;
      const result = TokenPayloadSchema.safeParse(withoutSub);
      expect(result.success).toBe(false);
    });

    it('should require iss', () => {
      const { iss: _, ...withoutIss } = VALID_PAYLOAD;
      const result = TokenPayloadSchema.safeParse(withoutIss);
      expect(result.success).toBe(false);
    });

    it('should require aud', () => {
      const { aud: _, ...withoutAud } = VALID_PAYLOAD;
      const result = TokenPayloadSchema.safeParse(withoutAud);
      expect(result.success).toBe(false);
    });

    it('should accept aud as array', () => {
      const result = TokenPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        aud: ['https://api1.example.com', 'https://api2.example.com'],
      });
      expect(result.success).toBe(true);
    });

    it('should require exp', () => {
      const { exp: _, ...withoutExp } = VALID_PAYLOAD;
      const result = TokenPayloadSchema.safeParse(withoutExp);
      expect(result.success).toBe(false);
    });

    it('should require iat', () => {
      const { iat: _, ...withoutIat } = VALID_PAYLOAD;
      const result = TokenPayloadSchema.safeParse(withoutIat);
      expect(result.success).toBe(false);
    });

    it('should allow optional scope', () => {
      const { scope: _, ...withoutScope } = VALID_PAYLOAD;
      const result = TokenPayloadSchema.safeParse(withoutScope);
      expect(result.success).toBe(true);
    });

    it('should allow additional fields (passthrough)', () => {
      const result = TokenPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        custom_claim: 'value',
        another_claim: 123,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>)['custom_claim']).toBe('value');
      }
    });
  });

  describe('TokenValidationOptionsSchema', () => {
    it('should validate valid options', () => {
      const result = TokenValidationOptionsSchema.safeParse({
        issuer: 'https://test.auth0.com/',
        audience: 'https://api.example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should accept array audience', () => {
      const result = TokenValidationOptionsSchema.safeParse({
        issuer: 'https://test.auth0.com/',
        audience: ['aud1', 'aud2'],
      });
      expect(result.success).toBe(true);
    });

    it('should provide default clockTolerance', () => {
      const result = TokenValidationOptionsSchema.parse({
        issuer: 'https://test.auth0.com/',
        audience: 'https://api.example.com',
      });
      expect(result.clockTolerance).toBe(0);
    });

    it('should accept custom clockTolerance', () => {
      const result = TokenValidationOptionsSchema.parse({
        issuer: 'https://test.auth0.com/',
        audience: 'https://api.example.com',
        clockTolerance: 30,
      });
      expect(result.clockTolerance).toBe(30);
    });
  });

  describe('IntrospectionResponseSchema', () => {
    it('should validate minimal response', () => {
      const result = IntrospectionResponseSchema.safeParse({ active: true });
      expect(result.success).toBe(true);
    });

    it('should validate full response', () => {
      const result = IntrospectionResponseSchema.safeParse({
        active: true,
        scope: 'openid profile',
        client_id: 'client-123',
        username: 'user@example.com',
        token_type: 'Bearer',
        exp: NOW_SECONDS + 3600,
        iat: NOW_SECONDS,
        nbf: NOW_SECONDS,
        sub: 'user-123',
        aud: 'https://api.example.com',
        iss: 'https://test.auth0.com/',
        jti: 'token-id-123',
      });
      expect(result.success).toBe(true);
    });

    it('should require active field', () => {
      const result = IntrospectionResponseSchema.safeParse({ scope: 'openid' });
      expect(result.success).toBe(false);
    });
  });

  describe('TokenManagerConfigSchema', () => {
    it('should provide default values', () => {
      const result = TokenManagerConfigSchema.parse({});
      expect(result.expiryBufferSeconds).toBe(60);
      expect(result.introspectionEndpoint).toBeUndefined();
    });

    it('should accept custom config', () => {
      const result = TokenManagerConfigSchema.parse({
        expiryBufferSeconds: 120,
        introspectionEndpoint: 'https://test.auth0.com/oauth/introspect',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      });
      expect(result.expiryBufferSeconds).toBe(120);
      expect(result.introspectionEndpoint).toBe('https://test.auth0.com/oauth/introspect');
    });

    it('should validate introspectionEndpoint as URL', () => {
      const result = TokenManagerConfigSchema.safeParse({
        introspectionEndpoint: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// Error Class Tests
// =============================================================================

describe('Token Error Classes', () => {
  describe('TokenError', () => {
    it('should create error with code and message', () => {
      const error = new TokenError('test_code', 'Test message');
      expect(error.code).toBe('test_code');
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('TokenError');
    });
  });

  describe('TokenExpiredError', () => {
    it('should have correct defaults', () => {
      const error = new TokenExpiredError();
      expect(error.code).toBe('token_expired');
      expect(error.message).toBe('Token has expired');
      expect(error.name).toBe('TokenExpiredError');
    });

    it('should accept custom message', () => {
      const error = new TokenExpiredError('Custom expiration message');
      expect(error.message).toBe('Custom expiration message');
    });
  });

  describe('TokenValidationError', () => {
    it('should have correct defaults', () => {
      const error = new TokenValidationError();
      expect(error.code).toBe('token_invalid');
      expect(error.message).toBe('Token validation failed');
      expect(error.name).toBe('TokenValidationError');
    });

    it('should accept custom message', () => {
      const error = new TokenValidationError('Invalid issuer');
      expect(error.message).toBe('Invalid issuer');
    });
  });

  describe('TokenRefreshError', () => {
    it('should have correct defaults', () => {
      const error = new TokenRefreshError();
      expect(error.code).toBe('refresh_failed');
      expect(error.message).toBe('Token refresh failed');
      expect(error.name).toBe('TokenRefreshError');
    });
  });
});

// =============================================================================
// TokenManager Tests
// =============================================================================

describe('TokenManager', () => {
  let manager: TokenManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    manager = new TokenManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      const mgr = new TokenManager();
      expect(mgr.hasTokens()).toBe(false);
    });

    it('should accept custom config', () => {
      const mgr = new TokenManager({
        config: {
          expiryBufferSeconds: 120,
        },
      });
      expect(mgr.hasTokens()).toBe(false);
    });

    it('should accept OAuth client', () => {
      const client = new OAuthClient(TEST_OAUTH_CONFIG);
      const mgr = new TokenManager({ oauthClient: client });
      expect(mgr.hasTokens()).toBe(false);
    });
  });

  describe('storeToken', () => {
    it('should store token from response', () => {
      const stored = manager.storeToken(MOCK_TOKEN_RESPONSE);

      expect(stored.accessToken).toBe(MOCK_TOKEN_RESPONSE.accessToken);
      expect(stored.tokenType).toBe('Bearer');
      expect(stored.refreshToken).toBe('test-refresh-token');
      expect(stored.scope).toBe('openid profile email');
      expect(stored.storedAt).toBe(NOW);
    });

    it('should calculate expiration from expiresIn', () => {
      const stored = manager.storeToken(MOCK_TOKEN_RESPONSE);
      expect(stored.expiresAt).toBe(NOW + 3600 * 1000);
    });

    it('should default expiration to 1 hour if not specified', () => {
      const stored = manager.storeToken({
        accessToken: 'token',
        tokenType: 'Bearer',
      });
      expect(stored.expiresAt).toBe(NOW + 3600 * 1000);
    });

    it('should store with resource indicator', () => {
      const stored = manager.storeToken(MOCK_TOKEN_RESPONSE, 'https://api.example.com');

      expect(stored.resource).toBe('https://api.example.com');
    });

    it('should allow retrieving stored token', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);

      const retrieved = manager.getToken();
      expect(retrieved).toBeDefined();
      expect(retrieved?.accessToken).toBe(MOCK_TOKEN_RESPONSE.accessToken);
    });

    it('should store multiple tokens for different resources', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);
      manager.storeToken(
        { ...MOCK_TOKEN_RESPONSE, accessToken: 'token-2' },
        'https://api2.example.com'
      );

      const defaultToken = manager.getToken();
      const resourceToken = manager.getToken('https://api2.example.com');

      expect(defaultToken?.accessToken).toBe(MOCK_TOKEN_RESPONSE.accessToken);
      expect(resourceToken?.accessToken).toBe('token-2');
    });
  });

  describe('getToken', () => {
    it('should return undefined for non-existent token', () => {
      expect(manager.getToken()).toBeUndefined();
    });

    it('should return token for default resource', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);
      expect(manager.getToken()?.accessToken).toBe(MOCK_TOKEN_RESPONSE.accessToken);
    });

    it('should return token for specific resource', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE, 'https://api.example.com');
      expect(manager.getToken('https://api.example.com')?.accessToken).toBe(
        MOCK_TOKEN_RESPONSE.accessToken
      );
    });

    it('should return undefined for wrong resource', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE, 'https://api.example.com');
      expect(manager.getToken('https://other.example.com')).toBeUndefined();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for fresh token', () => {
      const stored = manager.storeToken(MOCK_TOKEN_RESPONSE);
      expect(manager.isTokenExpired(stored)).toBe(false);
    });

    it('should return true for expired token', () => {
      const stored = manager.storeToken(MOCK_TOKEN_RESPONSE);

      // Advance time past expiration
      vi.setSystemTime(NOW + 3600 * 1000 + 1);

      expect(manager.isTokenExpired(stored)).toBe(true);
    });

    it('should consider buffer time', () => {
      const stored = manager.storeToken(MOCK_TOKEN_RESPONSE);

      // Advance time to within buffer (60 seconds before expiry)
      vi.setSystemTime(NOW + 3600 * 1000 - 30 * 1000); // 30 seconds before expiry

      expect(manager.isTokenExpired(stored)).toBe(true);
    });

    it('should use custom buffer time', () => {
      const customManager = new TokenManager({
        config: { expiryBufferSeconds: 300 }, // 5 minutes buffer
      });
      const stored = customManager.storeToken(MOCK_TOKEN_RESPONSE);

      // Advance time to 4 minutes before expiry
      vi.setSystemTime(NOW + 3600 * 1000 - 240 * 1000);

      expect(customManager.isTokenExpired(stored)).toBe(true);
    });
  });

  describe('isPayloadExpired', () => {
    it('should return false for valid payload', () => {
      expect(manager.isPayloadExpired(VALID_PAYLOAD)).toBe(false);
    });

    it('should return true for expired payload', () => {
      const expiredPayload = { ...VALID_PAYLOAD, exp: NOW_SECONDS - 1 };
      expect(manager.isPayloadExpired(expiredPayload)).toBe(true);
    });

    it('should consider tolerance', () => {
      const justExpiredPayload = { ...VALID_PAYLOAD, exp: NOW_SECONDS - 5 };
      // Without tolerance, it's expired
      expect(manager.isPayloadExpired(justExpiredPayload, 0)).toBe(true);
      // With tolerance, it's still valid
      expect(manager.isPayloadExpired(justExpiredPayload, 10)).toBe(false);
    });
  });

  describe('removeToken', () => {
    it('should remove stored token', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);
      expect(manager.hasTokens()).toBe(true);

      const removed = manager.removeToken();
      expect(removed).toBe(true);
      expect(manager.hasTokens()).toBe(false);
    });

    it('should remove specific resource token', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);
      manager.storeToken(MOCK_TOKEN_RESPONSE, 'https://api.example.com');

      manager.removeToken('https://api.example.com');

      expect(manager.getToken()).toBeDefined();
      expect(manager.getToken('https://api.example.com')).toBeUndefined();
    });

    it('should return false for non-existent token', () => {
      expect(manager.removeToken()).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all tokens', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);
      manager.storeToken(MOCK_TOKEN_RESPONSE, 'https://api1.example.com');
      manager.storeToken(MOCK_TOKEN_RESPONSE, 'https://api2.example.com');

      expect(manager.hasTokens()).toBe(true);

      manager.clear();

      expect(manager.hasTokens()).toBe(false);
      expect(manager.getStoredResources()).toEqual([]);
    });
  });

  describe('getStoredResources', () => {
    it('should return empty array when no tokens', () => {
      expect(manager.getStoredResources()).toEqual([]);
    });

    it('should return resource keys (excluding default)', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);
      manager.storeToken(MOCK_TOKEN_RESPONSE, 'https://api1.example.com');
      manager.storeToken(MOCK_TOKEN_RESPONSE, 'https://api2.example.com');

      const resources = manager.getStoredResources();
      expect(resources).toContain('https://api1.example.com');
      expect(resources).toContain('https://api2.example.com');
      expect(resources).not.toContain('__default__');
    });
  });

  describe('hasTokens', () => {
    it('should return false when empty', () => {
      expect(manager.hasTokens()).toBe(false);
    });

    it('should return true when tokens exist', () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);
      expect(manager.hasTokens()).toBe(true);
    });
  });

  describe('validateJwtFormat', () => {
    it('should validate valid JWT', () => {
      const payload = manager.validateJwtFormat(VALID_JWT);
      expect(payload.sub).toBe('user-123');
      expect(payload.iss).toBe('https://test.auth0.com/');
    });

    it('should throw for invalid JWT structure', () => {
      expect(() => manager.validateJwtFormat('not-a-jwt')).toThrow(TokenValidationError);
      expect(() => manager.validateJwtFormat('part1.part2')).toThrow(TokenValidationError);
    });

    it('should throw for invalid base64 payload', () => {
      expect(() => manager.validateJwtFormat('header.!!!invalid!!!.signature')).toThrow(
        TokenValidationError
      );
    });

    it('should throw for invalid payload structure', () => {
      const invalidPayloadJwt = createTestJwt({ foo: 'bar' });
      expect(() => manager.validateJwtFormat(invalidPayloadJwt)).toThrow(TokenValidationError);
    });

    it('should validate issuer when options provided', () => {
      const options: TokenValidationOptions = {
        issuer: 'https://wrong.issuer.com/',
        audience: 'https://api.example.com',
      };

      expect(() => manager.validateJwtFormat(VALID_JWT, options)).toThrow('Invalid issuer');
    });

    it('should validate audience when options provided', () => {
      const options: TokenValidationOptions = {
        issuer: 'https://test.auth0.com/',
        audience: 'https://wrong.audience.com',
      };

      expect(() => manager.validateJwtFormat(VALID_JWT, options)).toThrow('Invalid audience');
    });

    it('should accept array audience', () => {
      const multiAudJwt = createTestJwt({
        ...VALID_PAYLOAD,
        aud: ['aud1', 'aud2', 'aud3'],
      });

      const options: TokenValidationOptions = {
        issuer: 'https://test.auth0.com/',
        audience: 'aud2',
      };

      const payload = manager.validateJwtFormat(multiAudJwt, options);
      expect(payload).toBeDefined();
    });

    it('should accept array expected audience', () => {
      const options: TokenValidationOptions = {
        issuer: 'https://test.auth0.com/',
        audience: ['https://api.example.com', 'https://other.example.com'],
      };

      const payload = manager.validateJwtFormat(VALID_JWT, options);
      expect(payload).toBeDefined();
    });

    it('should validate expiration with clock tolerance', () => {
      // Create an expired token
      const expiredJwt = createTestJwt({
        ...VALID_PAYLOAD,
        exp: NOW_SECONDS - 5, // Expired 5 seconds ago
      });

      // Without tolerance, should throw
      const options: TokenValidationOptions = {
        issuer: 'https://test.auth0.com/',
        audience: 'https://api.example.com',
        clockTolerance: 0,
      };

      expect(() => manager.validateJwtFormat(expiredJwt, options)).toThrow(TokenExpiredError);

      // With tolerance, should pass
      const optionsWithTolerance: TokenValidationOptions = {
        ...options,
        clockTolerance: 10,
      };

      const payload = manager.validateJwtFormat(expiredJwt, optionsWithTolerance);
      expect(payload).toBeDefined();
    });
  });

  describe('introspect', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let introspectManager: TokenManager;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
      introspectManager = new TokenManager({
        config: {
          introspectionEndpoint: 'https://test.auth0.com/oauth/introspect',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        },
      });
    });

    it('should throw if introspection not configured', async () => {
      await expect(manager.introspect('token')).rejects.toThrow(
        'Token introspection endpoint not configured'
      );
    });

    it('should call introspection endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active: true }),
      });

      await introspectManager.introspect('test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.auth0.com/oauth/introspect',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          }),
        })
      );

      // Check body contains token
      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('token')).toBe('test-token');
    });

    it('should include Basic auth header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active: true }),
      });

      await introspectManager.introspect('test-token');

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toMatch(/^Basic /);
    });

    it('should include token_type_hint if provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active: true }),
      });

      await introspectManager.introspect('test-token', 'refresh_token');

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('token_type_hint')).toBe('refresh_token');
    });

    it('should return introspection response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            active: true,
            scope: 'openid profile',
            client_id: 'client-id',
          }),
      });

      const result = await introspectManager.introspect('test-token');

      expect(result.active).toBe(true);
      expect(result.scope).toBe('openid profile');
    });

    it('should throw on error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(introspectManager.introspect('test-token')).rejects.toThrow(
        'Token introspection failed with status 401'
      );
    });
  });

  describe('validateWithIntrospection', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let introspectManager: TokenManager;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
      introspectManager = new TokenManager({
        config: {
          introspectionEndpoint: 'https://test.auth0.com/oauth/introspect',
        },
      });
    });

    it('should return true for active token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active: true }),
      });

      const result = await introspectManager.validateWithIntrospection('test-token');
      expect(result).toBe(true);
    });

    it('should return false for inactive token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active: false }),
      });

      const result = await introspectManager.validateWithIntrospection('test-token');
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await introspectManager.validateWithIntrospection('test-token');
      expect(result).toBe(false);
    });
  });

  describe('getValidAccessToken', () => {
    it('should throw if no token available', async () => {
      await expect(manager.getValidAccessToken()).rejects.toThrow(
        'No token available for this resource'
      );
    });

    it('should return access token if not expired', async () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);

      const token = await manager.getValidAccessToken();
      expect(token).toBe(MOCK_TOKEN_RESPONSE.accessToken);
    });

    it('should throw if expired and no refresh token', async () => {
      manager.storeToken({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600 });

      // Advance past expiration
      vi.setSystemTime(NOW + 3700 * 1000);

      await expect(manager.getValidAccessToken()).rejects.toThrow(TokenExpiredError);
    });

    it('should throw if expired and no OAuth client', async () => {
      manager.storeToken(MOCK_TOKEN_RESPONSE);

      // Advance past expiration
      vi.setSystemTime(NOW + 3700 * 1000);

      await expect(manager.getValidAccessToken()).rejects.toThrow(TokenExpiredError);
    });
  });

  describe('refresh', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let oauthClient: OAuthClient;
    let managerWithClient: TokenManager;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
      oauthClient = new OAuthClient(TEST_OAUTH_CONFIG);
      managerWithClient = new TokenManager({ oauthClient });
    });

    it('should return error if no token to refresh', async () => {
      const result = await managerWithClient.refresh();
      expect(result.success).toBe(false);
      expect(result.error).toBe('No token to refresh');
    });

    it('should return error if no refresh token', async () => {
      managerWithClient.storeToken({ accessToken: 'token', tokenType: 'Bearer' });

      const result = await managerWithClient.refresh();
      expect(result.success).toBe(false);
      expect(result.error).toBe('No refresh token available');
    });

    it('should successfully refresh token', async () => {
      managerWithClient.storeToken(MOCK_TOKEN_RESPONSE);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'new-refresh-token',
          }),
      });

      const result = await managerWithClient.refresh();

      expect(result.success).toBe(true);
      expect(result.token?.accessToken).toBe('new-access-token');
      expect(result.token?.refreshToken).toBe('new-refresh-token');
    });

    it('should handle refresh token rotation', async () => {
      managerWithClient.storeToken(MOCK_TOKEN_RESPONSE);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'rotated-refresh-token',
          }),
      });

      await managerWithClient.refresh();

      const stored = managerWithClient.getToken();
      expect(stored?.refreshToken).toBe('rotated-refresh-token');
    });

    it('should handle refresh failure', async () => {
      managerWithClient.storeToken(MOCK_TOKEN_RESPONSE);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'Refresh token expired',
          }),
      });

      const result = await managerWithClient.refresh();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Refresh token expired');
    });

    it('should remove token on invalid_grant error', async () => {
      managerWithClient.storeToken(MOCK_TOKEN_RESPONSE);
      expect(managerWithClient.hasTokens()).toBe(true);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'Refresh token revoked',
          }),
      });

      await managerWithClient.refresh();

      expect(managerWithClient.hasTokens()).toBe(false);
    });

    it('should deduplicate concurrent refresh requests', async () => {
      managerWithClient.storeToken(MOCK_TOKEN_RESPONSE);

      let resolvePromise: (value: unknown) => void;
      const delayedPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      mockFetch.mockImplementation(() => {
        return delayedPromise.then(() => ({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'new-access-token',
              token_type: 'Bearer',
              expires_in: 3600,
            }),
        }));
      });

      // Start multiple concurrent refreshes
      const promise1 = managerWithClient.refresh();
      const promise2 = managerWithClient.refresh();
      const promise3 = managerWithClient.refresh();

      // Resolve the fetch
      resolvePromise!(undefined);

      await Promise.all([promise1, promise2, promise3]);

      // Should only have called fetch once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should refresh for specific resource', async () => {
      managerWithClient.storeToken(MOCK_TOKEN_RESPONSE, 'https://api.example.com');

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
      });

      const result = await managerWithClient.refresh('https://api.example.com');

      expect(result.success).toBe(true);
      expect(managerWithClient.getToken('https://api.example.com')?.accessToken).toBe(
        'new-access-token'
      );
    });
  });
});

// =============================================================================
// Standalone Function Tests
// =============================================================================

describe('Standalone Functions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      expect(isTokenExpired(VALID_PAYLOAD)).toBe(false);
    });

    it('should return true for expired token', () => {
      const expiredPayload = { ...VALID_PAYLOAD, exp: NOW_SECONDS - 1 };
      expect(isTokenExpired(expiredPayload)).toBe(true);
    });

    it('should handle tolerance', () => {
      const justExpiredPayload = { ...VALID_PAYLOAD, exp: NOW_SECONDS - 5 };
      expect(isTokenExpired(justExpiredPayload, 10)).toBe(false);
    });
  });

  describe('validateAccessToken', () => {
    it('should validate valid token', async () => {
      const options: TokenValidationOptions = {
        issuer: 'https://test.auth0.com/',
        audience: 'https://api.example.com',
      };

      const payload = await validateAccessToken(VALID_JWT, options);
      expect(payload.sub).toBe('user-123');
    });

    it('should throw for invalid token', async () => {
      const options: TokenValidationOptions = {
        issuer: 'https://test.auth0.com/',
        audience: 'https://api.example.com',
      };

      await expect(validateAccessToken('invalid-token', options)).rejects.toThrow(
        TokenValidationError
      );
    });
  });

  describe('refreshAccessToken', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    it('should refresh token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-token',
            refresh_token: 'new-refresh',
          }),
      });

      const result = await refreshAccessToken(
        'refresh-token',
        'https://test.auth0.com/oauth/token',
        'client-id',
        'client-secret'
      );

      expect(result.accessToken).toBe('new-token');
      expect(result.refreshToken).toBe('new-refresh');
    });

    it('should send correct request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'new-token' }),
      });

      await refreshAccessToken(
        'refresh-token',
        'https://test.auth0.com/oauth/token',
        'client-id',
        'client-secret'
      );

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-token');
      expect(body.get('client_id')).toBe('client-id');
      expect(body.get('client_secret')).toBe('client-secret');
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(
        refreshAccessToken('refresh-token', 'https://test.auth0.com/oauth/token')
      ).rejects.toThrow(TokenRefreshError);
    });
  });
});

// =============================================================================
// Security Tests
// =============================================================================

describe('Security', () => {
  describe('Secure Storage', () => {
    it('should not expose token values in error messages', () => {
      const manager = new TokenManager();

      try {
        manager.validateJwtFormat('secret.token.value');
      } catch (e) {
        // Error message should not contain the token
        expect((e as Error).message).not.toContain('secret.token.value');
      }
    });

    it('should clear all data on clear()', () => {
      const manager = new TokenManager();
      manager.storeToken(MOCK_TOKEN_RESPONSE);
      manager.storeToken(MOCK_TOKEN_RESPONSE, 'resource1');
      manager.storeToken(MOCK_TOKEN_RESPONSE, 'resource2');

      manager.clear();

      expect(manager.hasTokens()).toBe(false);
      expect(manager.getToken()).toBeUndefined();
      expect(manager.getToken('resource1')).toBeUndefined();
      expect(manager.getToken('resource2')).toBeUndefined();
    });

    it('should use in-memory storage only (no persistence)', () => {
      // TokenManager stores tokens in a private Map, not in localStorage/sessionStorage
      // This test verifies that creating multiple managers results in isolated storage
      const manager1 = new TokenManager();
      const manager2 = new TokenManager();

      manager1.storeToken(MOCK_TOKEN_RESPONSE);

      // manager2 should not see tokens from manager1 (isolated storage)
      expect(manager1.hasTokens()).toBe(true);
      expect(manager2.hasTokens()).toBe(false);

      // After clearing manager1, tokens should be gone
      manager1.clear();
      expect(manager1.hasTokens()).toBe(false);
    });
  });

  describe('Token Validation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should reject tokens with wrong issuer', () => {
      const manager = new TokenManager();
      const options: TokenValidationOptions = {
        issuer: 'https://expected.issuer.com/',
        audience: 'https://api.example.com',
      };

      expect(() => manager.validateJwtFormat(VALID_JWT, options)).toThrow(
        'Invalid issuer'
      );
    });

    it('should reject tokens with wrong audience', () => {
      const manager = new TokenManager();
      const options: TokenValidationOptions = {
        issuer: 'https://test.auth0.com/',
        audience: 'https://wrong.audience.com',
      };

      expect(() => manager.validateJwtFormat(VALID_JWT, options)).toThrow('Invalid audience');
    });

    it('should reject expired tokens', () => {
      const manager = new TokenManager();
      const expiredJwt = createTestJwt({
        ...VALID_PAYLOAD,
        exp: NOW_SECONDS - 1,
      });

      const options: TokenValidationOptions = {
        issuer: 'https://test.auth0.com/',
        audience: 'https://api.example.com',
      };

      expect(() => manager.validateJwtFormat(expiredJwt, options)).toThrow(TokenExpiredError);
    });
  });
});
