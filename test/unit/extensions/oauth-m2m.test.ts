import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  M2MClient,
  M2MAuthError,
  M2MClientConfigSchema,
  M2MTokenResponseSchema,
  M2MTokenErrorSchema,
  createM2MClient,
  createAuth0M2MClient,
  createOAuthM2MExtension,
  createOAuthM2MPlaceholder,
  OAUTH_M2M_EXTENSION_NAME,
  OAUTH_M2M_EXTENSION_VERSION,
  type M2MClientConfig,
  type OAuthM2MExtensionConfig,
} from '../../../src/extensions/oauth-m2m.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OAuth M2M Extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Zod Schemas', () => {
    describe('M2MClientConfigSchema', () => {
      it('should validate valid config', () => {
        const config = {
          tokenEndpoint: 'https://auth.example.com/token',
          clientId: 'client-123',
          clientSecret: 'secret-456',
        };
        const result = M2MClientConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.authMethod).toBe('client_secret_basic'); // default
          expect(result.data.expiryBufferSeconds).toBe(60); // default
        }
      });

      it('should accept all auth methods', () => {
        const baseConfig = {
          tokenEndpoint: 'https://auth.example.com/token',
          clientId: 'client-123',
          clientSecret: 'secret-456',
        };

        const basicResult = M2MClientConfigSchema.safeParse({
          ...baseConfig,
          authMethod: 'client_secret_basic',
        });
        expect(basicResult.success).toBe(true);

        const postResult = M2MClientConfigSchema.safeParse({
          ...baseConfig,
          authMethod: 'client_secret_post',
        });
        expect(postResult.success).toBe(true);
      });

      it('should reject invalid auth methods', () => {
        const config = {
          tokenEndpoint: 'https://auth.example.com/token',
          clientId: 'client-123',
          clientSecret: 'secret-456',
          authMethod: 'invalid_method',
        };
        const result = M2MClientConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
      });

      it('should require valid URL for tokenEndpoint', () => {
        const config = {
          tokenEndpoint: 'not-a-url',
          clientId: 'client-123',
          clientSecret: 'secret-456',
        };
        const result = M2MClientConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
      });

      it('should require non-empty clientId and clientSecret', () => {
        const emptyClientId = M2MClientConfigSchema.safeParse({
          tokenEndpoint: 'https://auth.example.com/token',
          clientId: '',
          clientSecret: 'secret',
        });
        expect(emptyClientId.success).toBe(false);

        const emptySecret = M2MClientConfigSchema.safeParse({
          tokenEndpoint: 'https://auth.example.com/token',
          clientId: 'client',
          clientSecret: '',
        });
        expect(emptySecret.success).toBe(false);
      });
    });

    describe('M2MTokenResponseSchema', () => {
      it('should validate valid token response', () => {
        const response = {
          access_token: 'token-abc',
          token_type: 'Bearer',
          expires_in: 3600,
        };
        const result = M2MTokenResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      });

      it('should require Bearer token type', () => {
        const response = {
          access_token: 'token-abc',
          token_type: 'MAC',
          expires_in: 3600,
        };
        const result = M2MTokenResponseSchema.safeParse(response);
        expect(result.success).toBe(false);
      });

      it('should allow optional scope', () => {
        const response = {
          access_token: 'token-abc',
          token_type: 'Bearer',
          scope: 'read:data write:data',
        };
        const result = M2MTokenResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      });
    });

    describe('M2MTokenErrorSchema', () => {
      it('should validate error response', () => {
        const error = {
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        };
        const result = M2MTokenErrorSchema.safeParse(error);
        expect(result.success).toBe(true);
      });

      it('should allow optional error_uri', () => {
        const error = {
          error: 'invalid_client',
          error_uri: 'https://docs.example.com/errors/invalid_client',
        };
        const result = M2MTokenErrorSchema.safeParse(error);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('M2MAuthError', () => {
    it('should create error with code and message', () => {
      const error = new M2MAuthError('invalid_client', 'Client authentication failed');
      expect(error.errorCode).toBe('invalid_client');
      expect(error.message).toBe('Client authentication failed');
      expect(error.name).toBe('M2MAuthError');
    });

    it('should create error with optional error_uri', () => {
      const error = new M2MAuthError(
        'invalid_client',
        'Client authentication failed',
        'https://docs.example.com/errors'
      );
      expect(error.errorUri).toBe('https://docs.example.com/errors');
    });

    it('should create from token error response', () => {
      const tokenError = {
        error: 'invalid_grant',
        error_description: 'Invalid credentials',
        error_uri: 'https://docs.example.com/errors',
      };
      const error = M2MAuthError.fromTokenError(tokenError);
      expect(error.errorCode).toBe('invalid_grant');
      expect(error.message).toBe('Invalid credentials');
      expect(error.errorUri).toBe('https://docs.example.com/errors');
    });

    it('should use error as message if no description', () => {
      const tokenError = { error: 'server_error' };
      const error = M2MAuthError.fromTokenError(tokenError);
      expect(error.message).toBe('server_error');
    });

    it('should be instanceof Error', () => {
      const error = new M2MAuthError('test', 'message');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('M2MClient', () => {
    const validConfig: OAuthM2MExtensionConfig = {
      tokenEndpoint: 'https://auth.example.com/oauth/token',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    };

    const mockTokenResponse = {
      access_token: 'mock-access-token',
      token_type: 'Bearer' as const,
      expires_in: 3600,
      scope: 'read:data',
    };

    describe('constructor', () => {
      it('should create client with valid config', () => {
        const client = new M2MClient(validConfig);
        expect(client).toBeDefined();
      });

      it('should throw for invalid config', () => {
        expect(() => new M2MClient({ ...validConfig, tokenEndpoint: 'not-a-url' }))
          .toThrow();
      });
    });

    describe('getConfig', () => {
      it('should return config without clientSecret', () => {
        const client = new M2MClient(validConfig);
        const config = client.getConfig();

        expect(config.tokenEndpoint).toBe(validConfig.tokenEndpoint);
        expect(config.clientId).toBe(validConfig.clientId);
        expect((config as M2MClientConfig).clientSecret).toBeUndefined();
      });
    });

    describe('getAccessToken', () => {
      it('should fetch token from endpoint', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        });

        const client = new M2MClient(validConfig);
        const token = await client.getAccessToken();

        expect(token).toBe('mock-access-token');
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('should use client_secret_basic auth by default', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        });

        const client = new M2MClient(validConfig);
        await client.getAccessToken();

        const [url, options] = mockFetch.mock.calls[0]!;
        expect(url).toBe('https://auth.example.com/oauth/token');

        // Check Authorization header has Basic auth
        const headers = options.headers as Record<string, string>;
        expect(headers['Authorization']).toMatch(/^Basic /);

        // Verify body doesn't contain credentials
        const body = options.body as string;
        expect(body).not.toContain('client_id=');
        expect(body).not.toContain('client_secret=');
        expect(body).toContain('grant_type=client_credentials');
      });

      it('should use client_secret_post auth when configured', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        });

        const client = new M2MClient({
          ...validConfig,
          authMethod: 'client_secret_post',
        });
        await client.getAccessToken();

        const [, options] = mockFetch.mock.calls[0]!;

        // Check no Authorization header
        const headers = options.headers as Record<string, string>;
        expect(headers['Authorization']).toBeUndefined();

        // Verify body contains credentials
        const body = options.body as string;
        expect(body).toContain('client_id=test-client');
        expect(body).toContain('client_secret=test-secret');
      });

      it('should include scopes in request', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        });

        const client = new M2MClient({
          ...validConfig,
          scopes: ['read:data', 'write:data'],
        });
        await client.getAccessToken();

        const [, options] = mockFetch.mock.calls[0]!;
        const body = options.body as string;
        expect(body).toContain('scope=read%3Adata+write%3Adata');
      });

      it('should include audience in request', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        });

        const client = new M2MClient({
          ...validConfig,
          audience: 'https://api.example.com',
        });
        await client.getAccessToken();

        const [, options] = mockFetch.mock.calls[0]!;
        const body = options.body as string;
        expect(body).toContain('audience=https%3A%2F%2Fapi.example.com');
      });

      it('should cache token and reuse it', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        });

        const client = new M2MClient(validConfig);

        const token1 = await client.getAccessToken();
        const token2 = await client.getAccessToken();

        expect(token1).toBe(token2);
        expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch
      });

      it('should fetch new token when options provided', async () => {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockTokenResponse),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ ...mockTokenResponse, access_token: 'new-token' }),
          });

        const client = new M2MClient(validConfig);

        const token1 = await client.getAccessToken();
        const token2 = await client.getAccessToken({ audience: 'https://other-api.example.com' });

        expect(token1).toBe('mock-access-token');
        expect(token2).toBe('new-token');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should throw M2MAuthError on error response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({
            error: 'invalid_client',
            error_description: 'Client authentication failed',
          }),
        });

        const client = new M2MClient(validConfig);

        try {
          await client.getAccessToken();
          expect.fail('Should have thrown M2MAuthError');
        } catch (error) {
          expect(error).toBeInstanceOf(M2MAuthError);
          expect((error as M2MAuthError).errorCode).toBe('invalid_client');
          expect((error as M2MAuthError).message).toBe('Client authentication failed');
        }
      });

      it('should throw server_error for non-standard error responses', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Internal error' }),
        });

        const client = new M2MClient(validConfig);

        try {
          await client.getAccessToken();
          expect.fail('Should have thrown M2MAuthError');
        } catch (error) {
          expect(error).toBeInstanceOf(M2MAuthError);
          expect((error as M2MAuthError).errorCode).toBe('server_error');
        }
      });

      it('should deduplicate concurrent requests', async () => {
        let resolvePromise: (value: unknown) => void;
        const delayedResponse = new Promise((resolve) => {
          resolvePromise = resolve;
        });

        mockFetch.mockReturnValueOnce(
          delayedResponse.then(() => ({
            ok: true,
            json: () => Promise.resolve(mockTokenResponse),
          }))
        );

        const client = new M2MClient(validConfig);

        // Start two requests concurrently
        const promise1 = client.getAccessToken();
        const promise2 = client.getAccessToken();

        // Resolve the fetch
        resolvePromise!(undefined);

        const [token1, token2] = await Promise.all([promise1, promise2]);

        expect(token1).toBe(token2);
        expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch despite two requests
      });
    });

    describe('isTokenValid', () => {
      it('should return false when no token cached', () => {
        const client = new M2MClient(validConfig);
        expect(client.isTokenValid()).toBe(false);
      });

      it('should return true when token is valid', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        });

        const client = new M2MClient(validConfig);
        await client.getAccessToken();

        expect(client.isTokenValid()).toBe(true);
      });

      it('should return false when token is about to expire', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ...mockTokenResponse,
            expires_in: 30, // 30 seconds, less than 60 second buffer
          }),
        });

        const client = new M2MClient(validConfig);
        await client.getAccessToken();

        expect(client.isTokenValid()).toBe(false);
      });
    });

    describe('clearCache', () => {
      it('should clear cached token', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        });

        const client = new M2MClient(validConfig);
        await client.getAccessToken();
        expect(client.isTokenValid()).toBe(true);

        client.clearCache();
        expect(client.isTokenValid()).toBe(false);
      });
    });

    describe('getTokenExpiration', () => {
      it('should return undefined when no token cached', () => {
        const client = new M2MClient(validConfig);
        expect(client.getTokenExpiration()).toBeUndefined();
      });

      it('should return expiration timestamp when token is cached', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        });

        const client = new M2MClient(validConfig);
        const beforeFetch = Date.now();
        await client.getAccessToken();
        const afterFetch = Date.now();

        const expiration = client.getTokenExpiration();
        expect(expiration).toBeDefined();
        // Should be approximately now + 3600 seconds
        expect(expiration).toBeGreaterThan(beforeFetch + 3600 * 1000 - 1000);
        expect(expiration).toBeLessThan(afterFetch + 3600 * 1000 + 1000);
      });
    });
  });

  describe('createAuth0M2MClient', () => {
    it('should create client with Auth0 token endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'auth0-token',
          token_type: 'Bearer',
          expires_in: 86400,
        }),
      });

      const client = createAuth0M2MClient(
        'my-tenant.auth0.com',
        'client-id',
        'client-secret'
      );

      await client.getAccessToken();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://my-tenant.auth0.com/oauth/token');
    });

    it('should handle domain with https prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'auth0-token',
          token_type: 'Bearer',
        }),
      });

      const client = createAuth0M2MClient(
        'https://my-tenant.auth0.com',
        'client-id',
        'client-secret'
      );

      await client.getAccessToken();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://my-tenant.auth0.com/oauth/token');
    });

    it('should handle domain with trailing slash', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'auth0-token',
          token_type: 'Bearer',
        }),
      });

      const client = createAuth0M2MClient(
        'https://my-tenant.auth0.com/',
        'client-id',
        'client-secret'
      );

      await client.getAccessToken();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://my-tenant.auth0.com/oauth/token');
    });

    it('should use client_secret_post by default for Auth0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'auth0-token',
          token_type: 'Bearer',
        }),
      });

      const client = createAuth0M2MClient(
        'my-tenant.auth0.com',
        'client-id',
        'client-secret'
      );

      await client.getAccessToken();

      const [, options] = mockFetch.mock.calls[0]!;
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();

      const body = options.body as string;
      expect(body).toContain('client_id=client-id');
      expect(body).toContain('client_secret=client-secret');
    });

    it('should include audience when specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'auth0-token',
          token_type: 'Bearer',
        }),
      });

      const client = createAuth0M2MClient(
        'my-tenant.auth0.com',
        'client-id',
        'client-secret',
        { audience: 'https://api.example.com' }
      );

      await client.getAccessToken();

      const [, options] = mockFetch.mock.calls[0]!;
      const body = options.body as string;
      expect(body).toContain('audience=https%3A%2F%2Fapi.example.com');
    });
  });

  describe('createM2MClient', () => {
    it('should create M2MClient instance', () => {
      const client = createM2MClient({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      });

      expect(client).toBeInstanceOf(M2MClient);
    });
  });

  describe('createOAuthM2MExtension', () => {
    it('should create extension with correct name and version', () => {
      const ext = createOAuthM2MExtension({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      });

      expect(ext.name).toBe(OAUTH_M2M_EXTENSION_NAME);
      expect(ext.version).toBe(OAUTH_M2M_EXTENSION_VERSION);
    });

    it('should include expected settings', () => {
      const ext = createOAuthM2MExtension({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      });

      expect(ext.settings).toEqual({
        grantTypes: ['client_credentials'],
        tokenEndpoint: 'https://auth.example.com/token',
        authMethods: ['client_secret_basic', 'client_secret_post'],
      });
    });

    it('should have lifecycle hooks', () => {
      const ext = createOAuthM2MExtension({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      });

      expect(typeof ext.onInitialize).toBe('function');
      expect(typeof ext.onShutdown).toBe('function');
    });

    it('onInitialize should fetch token to validate config', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'init-token',
          token_type: 'Bearer',
        }),
      });

      const ext = createOAuthM2MExtension({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      });

      await ext.onInitialize?.({});

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('onInitialize should throw on auth failure', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'invalid_client',
          error_description: 'Invalid credentials',
        }),
      });

      const ext = createOAuthM2MExtension({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      });

      await expect(ext.onInitialize?.({})).rejects.toThrow(M2MAuthError);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('onShutdown should not throw', async () => {
      const ext = createOAuthM2MExtension({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'secret',
      });

      await expect(ext.onShutdown?.()).resolves.not.toThrow();
    });
  });

  describe('createOAuthM2MPlaceholder', () => {
    it('should create placeholder extension', () => {
      const ext = createOAuthM2MPlaceholder();

      expect(ext.name).toBe(OAUTH_M2M_EXTENSION_NAME);
      expect(ext.version).toBe(OAUTH_M2M_EXTENSION_VERSION);
    });

    it('should have minimal settings', () => {
      const ext = createOAuthM2MPlaceholder();

      expect(ext.settings).toEqual({
        grantTypes: ['client_credentials'],
        authMethods: ['client_secret_basic', 'client_secret_post'],
      });
    });

    it('should have no-op lifecycle hooks', async () => {
      const ext = createOAuthM2MPlaceholder();

      await expect(ext.onInitialize?.({})).resolves.not.toThrow();
      await expect(ext.onShutdown?.()).resolves.not.toThrow();
    });
  });

  describe('Security', () => {
    it('should not expose clientSecret in getConfig', () => {
      const client = new M2MClient({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client',
        clientSecret: 'super-secret-value',
      });

      const config = client.getConfig();
      const configStr = JSON.stringify(config);

      expect(configStr).not.toContain('super-secret-value');
      expect(configStr).not.toContain('clientSecret');
    });

    it('should properly encode credentials for Basic auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'token',
          token_type: 'Bearer',
        }),
      });

      // Use credentials with special characters
      const client = new M2MClient({
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client:with:colons',
        clientSecret: 'secret/with/slashes',
        authMethod: 'client_secret_basic',
      });

      await client.getAccessToken();

      const [, options] = mockFetch.mock.calls[0]!;
      const headers = options.headers as Record<string, string>;
      const authHeader = headers['Authorization'];

      // Decode and verify
      const base64Part = authHeader.replace('Basic ', '');
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');

      // Should be URL-encoded per RFC 6749 Section 2.3.1
      expect(decoded).toContain('client%3Awith%3Acolons');
      expect(decoded).toContain('secret%2Fwith%2Fslashes');
    });
  });

  describe('Constants', () => {
    it('should export correct extension name', () => {
      expect(OAUTH_M2M_EXTENSION_NAME).toBe('anthropic/oauth-m2m');
    });

    it('should export correct version', () => {
      expect(OAUTH_M2M_EXTENSION_VERSION).toBe('1.0.0');
    });
  });
});
