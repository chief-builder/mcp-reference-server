/**
 * Machine-to-Machine (M2M) OAuth Client Tests
 *
 * Tests for the M2M OAuth extension including:
 * - Client configuration and validation
 * - Token request with client_secret_basic authentication
 * - Token request with client_secret_post authentication
 * - Token caching and expiration
 * - Concurrent request deduplication
 * - Error handling
 * - Auth0 client factory
 * - Extension creation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import {
  M2MClient,
  M2MAuthError,
  createM2MClient,
  createAuth0M2MClient,
  createOAuthM2MExtension,
  createOAuthM2MPlaceholder,
  OAUTH_M2M_EXTENSION_NAME,
  OAUTH_M2M_EXTENSION_VERSION,
  type M2MClientConfig,
  type OAuthM2MExtensionConfig,
} from '../../../src/extensions/oauth-m2m.js';
import { getTestPort } from '../../helpers/ports.js';

// =============================================================================
// Test Helpers
// =============================================================================

interface MockTokenServer {
  server: Server;
  port: number;
  url: string;
  requests: Array<{
    method: string;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>;
  setResponse: (response: {
    status?: number;
    body?: Record<string, unknown>;
  }) => void;
}

async function createMockTokenServer(): Promise<MockTokenServer> {
  const port = getTestPort();
  const requests: MockTokenServer['requests'] = [];
  let responseConfig = {
    status: 200,
    body: {
      access_token: 'test-access-token',
      token_type: 'Bearer' as const,
      expires_in: 3600,
    } as Record<string, unknown>,
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      requests.push({
        method: req.method ?? 'GET',
        headers: req.headers as Record<string, string | string[] | undefined>,
        body,
      });

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = responseConfig.status;
      res.end(JSON.stringify(responseConfig.body));
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}/oauth/token`,
        requests,
        setResponse: (response) => {
          responseConfig = {
            status: response.status ?? 200,
            body: response.body ?? responseConfig.body,
          };
        },
      });
    });
  });
}

async function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function createTestConfig(tokenEndpoint: string): M2MClientConfig {
  return {
    tokenEndpoint,
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    authMethod: 'client_secret_basic',
    expiryBufferSeconds: 60,
  };
}

// =============================================================================
// M2MClient Tests
// =============================================================================

describe('M2MClient', () => {
  let mockServer: MockTokenServer;

  beforeEach(async () => {
    mockServer = await createMockTokenServer();
  });

  afterEach(async () => {
    if (mockServer) {
      await stopServer(mockServer.server);
    }
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);
      expect(client).toBeInstanceOf(M2MClient);
    });

    it('should throw on invalid config', () => {
      expect(() => new M2MClient({
        tokenEndpoint: 'not-a-url',
        clientId: 'test',
        clientSecret: 'secret',
      } as M2MClientConfig)).toThrow();
    });

    it('should throw on empty clientId', () => {
      expect(() => new M2MClient({
        tokenEndpoint: mockServer.url,
        clientId: '',
        clientSecret: 'secret',
      } as M2MClientConfig)).toThrow();
    });

    it('should throw on empty clientSecret', () => {
      expect(() => new M2MClient({
        tokenEndpoint: mockServer.url,
        clientId: 'test',
        clientSecret: '',
      } as M2MClientConfig)).toThrow();
    });

    it('should apply default authMethod', () => {
      const client = new M2MClient({
        tokenEndpoint: mockServer.url,
        clientId: 'test',
        clientSecret: 'secret',
      });
      const config = client.getConfig();
      expect(config.authMethod).toBe('client_secret_basic');
    });

    it('should apply default expiryBufferSeconds', () => {
      const client = new M2MClient({
        tokenEndpoint: mockServer.url,
        clientId: 'test',
        clientSecret: 'secret',
      });
      const config = client.getConfig();
      expect(config.expiryBufferSeconds).toBe(60);
    });
  });

  describe('getConfig', () => {
    it('should return config without clientSecret', () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);
      const safeConfig = client.getConfig();

      expect(safeConfig.tokenEndpoint).toBe(config.tokenEndpoint);
      expect(safeConfig.clientId).toBe(config.clientId);
      expect((safeConfig as Record<string, unknown>).clientSecret).toBeUndefined();
    });
  });

  describe('getAccessToken', () => {
    it('should request token from endpoint', async () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      const token = await client.getAccessToken();

      expect(token).toBe('test-access-token');
      expect(mockServer.requests).toHaveLength(1);
    });

    it('should use client_secret_basic authentication', async () => {
      const config = createTestConfig(mockServer.url);
      config.authMethod = 'client_secret_basic';
      const client = new M2MClient(config);

      await client.getAccessToken();

      const request = mockServer.requests[0];
      expect(request.headers.authorization).toBeDefined();
      expect(request.headers.authorization).toMatch(/^Basic /);

      // Decode and verify credentials
      const base64 = (request.headers.authorization as string).replace('Basic ', '');
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      expect(decoded).toBe('test-client-id:test-client-secret');
    });

    it('should use client_secret_post authentication', async () => {
      const config = createTestConfig(mockServer.url);
      config.authMethod = 'client_secret_post';
      const client = new M2MClient(config);

      await client.getAccessToken();

      const request = mockServer.requests[0];
      expect(request.headers.authorization).toBeUndefined();

      const params = new URLSearchParams(request.body);
      expect(params.get('client_id')).toBe('test-client-id');
      expect(params.get('client_secret')).toBe('test-client-secret');
    });

    it('should include grant_type in request body', async () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      await client.getAccessToken();

      const params = new URLSearchParams(mockServer.requests[0].body);
      expect(params.get('grant_type')).toBe('client_credentials');
    });

    it('should include scopes when configured', async () => {
      const config = createTestConfig(mockServer.url);
      config.scopes = ['read', 'write'];
      const client = new M2MClient(config);

      await client.getAccessToken();

      const params = new URLSearchParams(mockServer.requests[0].body);
      expect(params.get('scope')).toBe('read write');
    });

    it('should include audience when configured', async () => {
      const config = createTestConfig(mockServer.url);
      config.audience = 'https://api.example.com';
      const client = new M2MClient(config);

      await client.getAccessToken();

      const params = new URLSearchParams(mockServer.requests[0].body);
      expect(params.get('audience')).toBe('https://api.example.com');
    });

    it('should cache token and reuse on subsequent calls', async () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      const token1 = await client.getAccessToken();
      const token2 = await client.getAccessToken();

      expect(token1).toBe(token2);
      expect(mockServer.requests).toHaveLength(1); // Only one request made
    });

    it('should fetch new token when cache is cleared', async () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      await client.getAccessToken();
      client.clearCache();
      await client.getAccessToken();

      expect(mockServer.requests).toHaveLength(2);
    });

    it('should use custom scopes in options without caching', async () => {
      const config = createTestConfig(mockServer.url);
      config.scopes = ['default'];
      const client = new M2MClient(config);

      await client.getAccessToken({ scopes: ['custom'] });
      await client.getAccessToken({ scopes: ['custom'] });

      // Should make 2 requests since custom options bypass cache
      expect(mockServer.requests).toHaveLength(2);

      const params = new URLSearchParams(mockServer.requests[0].body);
      expect(params.get('scope')).toBe('custom');
    });

    it('should use custom audience in options without caching', async () => {
      const config = createTestConfig(mockServer.url);
      config.audience = 'https://default.example.com';
      const client = new M2MClient(config);

      await client.getAccessToken({ audience: 'https://custom.example.com' });

      const params = new URLSearchParams(mockServer.requests[0].body);
      expect(params.get('audience')).toBe('https://custom.example.com');
    });

    it('should deduplicate concurrent requests', async () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      // Start multiple concurrent requests
      const promises = [
        client.getAccessToken(),
        client.getAccessToken(),
        client.getAccessToken(),
      ];

      const tokens = await Promise.all(promises);

      // All should return the same token
      expect(tokens[0]).toBe(tokens[1]);
      expect(tokens[1]).toBe(tokens[2]);

      // Only one request should have been made
      expect(mockServer.requests).toHaveLength(1);
    });

    it('should handle URL-encoded credentials in basic auth', async () => {
      const config = createTestConfig(mockServer.url);
      config.clientId = 'client:with:colons';
      config.clientSecret = 'secret+with/special=chars';
      config.authMethod = 'client_secret_basic';
      const client = new M2MClient(config);

      await client.getAccessToken();

      const request = mockServer.requests[0];
      const base64 = (request.headers.authorization as string).replace('Basic ', '');
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');

      // RFC 6749 Section 2.3.1 requires URL encoding before base64
      expect(decoded).toBe('client%3Awith%3Acolons:secret%2Bwith%2Fspecial%3Dchars');
    });
  });

  describe('isTokenValid', () => {
    it('should return false when no token is cached', () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);
      expect(client.isTokenValid()).toBe(false);
    });

    it('should return true after token is fetched', async () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      await client.getAccessToken();

      expect(client.isTokenValid()).toBe(true);
    });

    it('should return false after cache is cleared', async () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      await client.getAccessToken();
      client.clearCache();

      expect(client.isTokenValid()).toBe(false);
    });

    it('should consider expiry buffer', async () => {
      mockServer.setResponse({
        body: {
          access_token: 'short-lived-token',
          token_type: 'Bearer',
          expires_in: 30, // 30 seconds
        },
      });

      const config = createTestConfig(mockServer.url);
      config.expiryBufferSeconds = 60; // 60 second buffer
      const client = new M2MClient(config);

      await client.getAccessToken();

      // Token expires in 30s but buffer is 60s, so it should be considered invalid
      expect(client.isTokenValid()).toBe(false);
    });
  });

  describe('getTokenExpiration', () => {
    it('should return undefined when no token is cached', () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);
      expect(client.getTokenExpiration()).toBeUndefined();
    });

    it('should return expiration timestamp after token is fetched', async () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      const before = Date.now();
      await client.getAccessToken();
      const after = Date.now();

      const expiration = client.getTokenExpiration();
      expect(expiration).toBeDefined();

      // Should expire in about 3600 seconds (from mock response)
      const expectedMin = before + 3600 * 1000;
      const expectedMax = after + 3600 * 1000;
      expect(expiration).toBeGreaterThanOrEqual(expectedMin);
      expect(expiration).toBeLessThanOrEqual(expectedMax);
    });

    it('should use default expiry when not provided in response', async () => {
      mockServer.setResponse({
        body: {
          access_token: 'no-expiry-token',
          token_type: 'Bearer',
          // No expires_in
        },
      });

      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      const before = Date.now();
      await client.getAccessToken();
      const after = Date.now();

      const expiration = client.getTokenExpiration();
      // Default should be 1 hour (3600 seconds)
      const expectedMin = before + 3600 * 1000;
      const expectedMax = after + 3600 * 1000;
      expect(expiration).toBeGreaterThanOrEqual(expectedMin);
      expect(expiration).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('clearCache', () => {
    it('should clear cached token', async () => {
      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      await client.getAccessToken();
      expect(client.isTokenValid()).toBe(true);

      client.clearCache();

      expect(client.isTokenValid()).toBe(false);
      expect(client.getTokenExpiration()).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw M2MAuthError on OAuth error response', async () => {
      mockServer.setResponse({
        status: 400,
        body: {
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        },
      });

      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      await expect(client.getAccessToken()).rejects.toThrow(M2MAuthError);

      try {
        await client.getAccessToken();
      } catch (error) {
        expect(error).toBeInstanceOf(M2MAuthError);
        const authError = error as M2MAuthError;
        expect(authError.errorCode).toBe('invalid_client');
        expect(authError.message).toBe('Invalid client credentials');
      }
    });

    it('should throw M2MAuthError on non-OAuth error response', async () => {
      mockServer.setResponse({
        status: 500,
        body: { message: 'Internal server error' },
      });

      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      await expect(client.getAccessToken()).rejects.toThrow(M2MAuthError);

      try {
        await client.getAccessToken();
      } catch (error) {
        expect(error).toBeInstanceOf(M2MAuthError);
        const authError = error as M2MAuthError;
        expect(authError.errorCode).toBe('server_error');
        expect(authError.message).toContain('500');
      }
    });

    it('should include error_uri when provided', async () => {
      mockServer.setResponse({
        status: 400,
        body: {
          error: 'invalid_scope',
          error_description: 'The requested scope is invalid',
          error_uri: 'https://example.com/docs/errors#invalid_scope',
        },
      });

      const config = createTestConfig(mockServer.url);
      const client = new M2MClient(config);

      try {
        await client.getAccessToken();
      } catch (error) {
        expect(error).toBeInstanceOf(M2MAuthError);
        const authError = error as M2MAuthError;
        expect(authError.errorUri).toBe('https://example.com/docs/errors#invalid_scope');
      }
    });
  });
});

// =============================================================================
// M2MAuthError Tests
// =============================================================================

describe('M2MAuthError', () => {
  it('should create error with all properties', () => {
    const error = new M2MAuthError(
      'invalid_token',
      'Token has expired',
      'https://example.com/docs/errors'
    );

    expect(error.name).toBe('M2MAuthError');
    expect(error.errorCode).toBe('invalid_token');
    expect(error.message).toBe('Token has expired');
    expect(error.errorUri).toBe('https://example.com/docs/errors');
    expect(error instanceof Error).toBe(true);
  });

  it('should create from token error response', () => {
    const error = M2MAuthError.fromTokenError({
      error: 'access_denied',
      error_description: 'Access was denied',
    });

    expect(error.errorCode).toBe('access_denied');
    expect(error.message).toBe('Access was denied');
  });

  it('should use error code as message when description not provided', () => {
    const error = M2MAuthError.fromTokenError({
      error: 'unknown_error',
    });

    expect(error.errorCode).toBe('unknown_error');
    expect(error.message).toBe('unknown_error');
  });

  it('should have proper stack trace', () => {
    const error = new M2MAuthError('test_error', 'Test message');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('M2MAuthError');
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('createM2MClient', () => {
  let mockServer: MockTokenServer;

  beforeEach(async () => {
    mockServer = await createMockTokenServer();
  });

  afterEach(async () => {
    if (mockServer) {
      await stopServer(mockServer.server);
    }
  });

  it('should create M2M client with config', () => {
    const client = createM2MClient({
      tokenEndpoint: mockServer.url,
      clientId: 'test-id',
      clientSecret: 'test-secret',
    });

    expect(client).toBeInstanceOf(M2MClient);
  });

  it('should work with full config options', async () => {
    const client = createM2MClient({
      tokenEndpoint: mockServer.url,
      clientId: 'test-id',
      clientSecret: 'test-secret',
      authMethod: 'client_secret_post',
      scopes: ['api:read'],
      audience: 'https://api.example.com',
      expiryBufferSeconds: 120,
    });

    const token = await client.getAccessToken();
    expect(token).toBe('test-access-token');
  });
});

describe('createAuth0M2MClient', () => {
  let mockServer: MockTokenServer;

  beforeEach(async () => {
    mockServer = await createMockTokenServer();
  });

  afterEach(async () => {
    if (mockServer) {
      await stopServer(mockServer.server);
    }
  });

  it('should create client with Auth0 domain', () => {
    const client = createAuth0M2MClient(
      'tenant.auth0.com',
      'client-id',
      'client-secret'
    );

    expect(client).toBeInstanceOf(M2MClient);
    const config = client.getConfig();
    expect(config.tokenEndpoint).toBe('https://tenant.auth0.com/oauth/token');
  });

  it('should handle domain with https prefix', () => {
    const client = createAuth0M2MClient(
      'https://tenant.auth0.com',
      'client-id',
      'client-secret'
    );

    const config = client.getConfig();
    expect(config.tokenEndpoint).toBe('https://tenant.auth0.com/oauth/token');
  });

  it('should handle domain with trailing slash', () => {
    const client = createAuth0M2MClient(
      'https://tenant.auth0.com/',
      'client-id',
      'client-secret'
    );

    const config = client.getConfig();
    expect(config.tokenEndpoint).toBe('https://tenant.auth0.com/oauth/token');
  });

  it('should default to client_secret_post for Auth0', () => {
    const client = createAuth0M2MClient(
      'tenant.auth0.com',
      'client-id',
      'client-secret'
    );

    const config = client.getConfig();
    expect(config.authMethod).toBe('client_secret_post');
  });

  it('should allow override of auth method', () => {
    const client = createAuth0M2MClient(
      'tenant.auth0.com',
      'client-id',
      'client-secret',
      { authMethod: 'client_secret_basic' }
    );

    const config = client.getConfig();
    expect(config.authMethod).toBe('client_secret_basic');
  });

  it('should include audience when provided', () => {
    const client = createAuth0M2MClient(
      'tenant.auth0.com',
      'client-id',
      'client-secret',
      { audience: 'https://api.example.com' }
    );

    const config = client.getConfig();
    expect(config.audience).toBe('https://api.example.com');
  });

  it('should include scopes when provided', () => {
    const client = createAuth0M2MClient(
      'tenant.auth0.com',
      'client-id',
      'client-secret',
      { scopes: ['read:users', 'write:users'] }
    );

    const config = client.getConfig();
    expect(config.scopes).toEqual(['read:users', 'write:users']);
  });
});

// =============================================================================
// Extension Tests
// =============================================================================

describe('createOAuthM2MExtension', () => {
  let mockServer: MockTokenServer;

  beforeEach(async () => {
    mockServer = await createMockTokenServer();
  });

  afterEach(async () => {
    if (mockServer) {
      await stopServer(mockServer.server);
    }
  });

  it('should create extension with correct name and version', () => {
    const extension = createOAuthM2MExtension({
      tokenEndpoint: mockServer.url,
      clientId: 'test-id',
      clientSecret: 'test-secret',
    });

    expect(extension.name).toBe(OAUTH_M2M_EXTENSION_NAME);
    expect(extension.version).toBe(OAUTH_M2M_EXTENSION_VERSION);
  });

  it('should include settings in extension', () => {
    const extension = createOAuthM2MExtension({
      tokenEndpoint: mockServer.url,
      clientId: 'test-id',
      clientSecret: 'test-secret',
    });

    expect(extension.settings).toBeDefined();
    expect(extension.settings?.grantTypes).toEqual(['client_credentials']);
    expect(extension.settings?.tokenEndpoint).toBe(mockServer.url);
    expect(extension.settings?.authMethods).toEqual(['client_secret_basic', 'client_secret_post']);
  });

  it('should validate token on initialize', async () => {
    const extension = createOAuthM2MExtension({
      tokenEndpoint: mockServer.url,
      clientId: 'test-id',
      clientSecret: 'test-secret',
    });

    await extension.onInitialize!({});

    expect(mockServer.requests).toHaveLength(1);
  });

  it('should throw on initialization failure', async () => {
    mockServer.setResponse({
      status: 401,
      body: {
        error: 'invalid_client',
        error_description: 'Invalid credentials',
      },
    });

    const extension = createOAuthM2MExtension({
      tokenEndpoint: mockServer.url,
      clientId: 'bad-id',
      clientSecret: 'bad-secret',
    });

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(extension.onInitialize!({})).rejects.toThrow(M2MAuthError);

    consoleSpy.mockRestore();
  });

  it('should have shutdown handler', async () => {
    const extension = createOAuthM2MExtension({
      tokenEndpoint: mockServer.url,
      clientId: 'test-id',
      clientSecret: 'test-secret',
    });

    // Should not throw
    await extension.onShutdown!();
  });
});

describe('createOAuthM2MPlaceholder', () => {
  it('should create placeholder extension', () => {
    const extension = createOAuthM2MPlaceholder();

    expect(extension.name).toBe(OAUTH_M2M_EXTENSION_NAME);
    expect(extension.version).toBe(OAUTH_M2M_EXTENSION_VERSION);
  });

  it('should have minimal settings', () => {
    const extension = createOAuthM2MPlaceholder();

    expect(extension.settings?.grantTypes).toEqual(['client_credentials']);
    expect(extension.settings?.authMethods).toEqual(['client_secret_basic', 'client_secret_post']);
    expect(extension.settings?.tokenEndpoint).toBeUndefined();
  });

  it('should have no-op handlers', async () => {
    const extension = createOAuthM2MPlaceholder();

    // Both should complete without error
    await extension.onInitialize!({});
    await extension.onShutdown!();
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('M2M OAuth Constants', () => {
  it('should export correct extension name', () => {
    expect(OAUTH_M2M_EXTENSION_NAME).toBe('anthropic/oauth-m2m');
  });

  it('should export correct extension version', () => {
    expect(OAUTH_M2M_EXTENSION_VERSION).toBe('1.0.0');
  });
});
