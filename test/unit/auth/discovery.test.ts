import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import { createServer, Server } from 'node:http';
import {
  // OAuth Server Metadata (RFC 8414)
  OAuthServerMetadata,
  getWellKnownPath,
  buildMetadata,
  WELL_KNOWN_OAUTH_SERVER,
  // Protected Resource Metadata (RFC 9728)
  ProtectedResourceMetadata,
  ProtectedResourceConfig,
  WELL_KNOWN_PROTECTED_RESOURCE,
  buildProtectedResourceMetadata,
  getProtectedResourceWellKnownPath,
  // WWW-Authenticate helpers
  WwwAuthenticateOptions,
  buildWwwAuthenticateHeader,
  create401Response,
  // Express integration
  createProtectedResourceRouter,
  registerProtectedResourceEndpoint,
} from '../../../src/auth/discovery.js';

// =============================================================================
// Test Helpers
// =============================================================================

let portCounter = 4100;
function getTestPort(): number {
  return portCounter++;
}

async function startServer(app: Express): Promise<{ server: Server; port: number }> {
  const port = getTestPort();
  const server = createServer(app);

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port });
    });
  });
}

async function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe('OAuth Discovery', () => {
  // =========================================================================
  // OAuth Authorization Server Metadata (RFC 8414)
  // =========================================================================

  describe('OAuth Server Metadata', () => {
    describe('getWellKnownPath', () => {
      it('should return correct well-known path', () => {
        expect(getWellKnownPath()).toBe('/.well-known/oauth-authorization-server');
      });

      it('should match WELL_KNOWN_OAUTH_SERVER constant', () => {
        expect(getWellKnownPath()).toBe(WELL_KNOWN_OAUTH_SERVER);
      });
    });

    describe('buildMetadata', () => {
      it('should build metadata with required fields', () => {
        const issuer = 'https://auth.example.com';
        const metadata = buildMetadata(issuer);

        expect(metadata.issuer).toBe(issuer);
        expect(metadata.authorizationEndpoint).toBe(`${issuer}/authorize`);
        expect(metadata.tokenEndpoint).toBe(`${issuer}/token`);
        expect(metadata.responseTypesSupported).toContain('code');
      });

      it('should include PKCE support', () => {
        const metadata = buildMetadata('https://auth.example.com');
        expect(metadata.codeChallengeMethodsSupported).toContain('S256');
      });

      it('should support standard grant types', () => {
        const metadata = buildMetadata('https://auth.example.com');
        expect(metadata.grantTypesSupported).toContain('authorization_code');
        expect(metadata.grantTypesSupported).toContain('refresh_token');
        expect(metadata.grantTypesSupported).toContain('client_credentials');
      });

      it('should support token endpoint auth methods', () => {
        const metadata = buildMetadata('https://auth.example.com');
        expect(metadata.tokenEndpointAuthMethodsSupported).toContain('client_secret_basic');
        expect(metadata.tokenEndpointAuthMethodsSupported).toContain('client_secret_post');
        expect(metadata.tokenEndpointAuthMethodsSupported).toContain('none');
      });
    });
  });

  // =========================================================================
  // Protected Resource Metadata (RFC 9728)
  // =========================================================================

  describe('Protected Resource Metadata', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment before each test
      vi.resetModules();
      process.env = { ...originalEnv };
      delete process.env.MCP_RESOURCE_URL;
      delete process.env.MCP_AUTH_SERVERS;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('getProtectedResourceWellKnownPath', () => {
      it('should return correct well-known path', () => {
        expect(getProtectedResourceWellKnownPath()).toBe('/.well-known/oauth-protected-resource');
      });

      it('should match WELL_KNOWN_PROTECTED_RESOURCE constant', () => {
        expect(getProtectedResourceWellKnownPath()).toBe(WELL_KNOWN_PROTECTED_RESOURCE);
      });
    });

    describe('buildProtectedResourceMetadata', () => {
      it('should build metadata with config values', () => {
        const config: ProtectedResourceConfig = {
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
        };

        const metadata = buildProtectedResourceMetadata(config);

        expect(metadata.resource).toBe('https://mcp-server.example.com');
        expect(metadata.authorization_servers).toEqual(['https://auth.example.com']);
      });

      it('should include default scopes', () => {
        const config: ProtectedResourceConfig = {
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
        };

        const metadata = buildProtectedResourceMetadata(config);

        expect(metadata.scopes_supported).toContain('tools:read');
        expect(metadata.scopes_supported).toContain('tools:execute');
        expect(metadata.scopes_supported).toContain('logging:write');
      });

      it('should use custom scopes when provided', () => {
        const config: ProtectedResourceConfig = {
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
          scopesSupported: ['read', 'write', 'admin'],
        };

        const metadata = buildProtectedResourceMetadata(config);

        expect(metadata.scopes_supported).toEqual(['read', 'write', 'admin']);
      });

      it('should include default bearer methods', () => {
        const config: ProtectedResourceConfig = {
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
        };

        const metadata = buildProtectedResourceMetadata(config);

        expect(metadata.bearer_methods_supported).toEqual(['header']);
      });

      it('should use custom bearer methods when provided', () => {
        const config: ProtectedResourceConfig = {
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
          bearerMethodsSupported: ['header', 'body'],
        };

        const metadata = buildProtectedResourceMetadata(config);

        expect(metadata.bearer_methods_supported).toEqual(['header', 'body']);
      });

      it('should support multiple authorization servers', () => {
        const config: ProtectedResourceConfig = {
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: [
            'https://auth1.example.com',
            'https://auth2.example.com',
          ],
        };

        const metadata = buildProtectedResourceMetadata(config);

        expect(metadata.authorization_servers).toHaveLength(2);
        expect(metadata.authorization_servers).toContain('https://auth1.example.com');
        expect(metadata.authorization_servers).toContain('https://auth2.example.com');
      });

      it('should read from environment variables when config not provided', () => {
        process.env.MCP_RESOURCE_URL = 'https://env-resource.example.com';
        process.env.MCP_AUTH_SERVERS = 'https://env-auth.example.com';

        const metadata = buildProtectedResourceMetadata({});

        expect(metadata.resource).toBe('https://env-resource.example.com');
        expect(metadata.authorization_servers).toEqual(['https://env-auth.example.com']);
      });

      it('should parse comma-separated auth servers from environment', () => {
        process.env.MCP_RESOURCE_URL = 'https://resource.example.com';
        process.env.MCP_AUTH_SERVERS = 'https://auth1.example.com, https://auth2.example.com';

        const metadata = buildProtectedResourceMetadata({});

        expect(metadata.authorization_servers).toEqual([
          'https://auth1.example.com',
          'https://auth2.example.com',
        ]);
      });

      it('should prefer config values over environment variables', () => {
        process.env.MCP_RESOURCE_URL = 'https://env-resource.example.com';
        process.env.MCP_AUTH_SERVERS = 'https://env-auth.example.com';

        const config: ProtectedResourceConfig = {
          resourceUrl: 'https://config-resource.example.com',
          authorizationServers: ['https://config-auth.example.com'],
        };

        const metadata = buildProtectedResourceMetadata(config);

        expect(metadata.resource).toBe('https://config-resource.example.com');
        expect(metadata.authorization_servers).toEqual(['https://config-auth.example.com']);
      });

      it('should throw error when resource URL is missing', () => {
        expect(() => buildProtectedResourceMetadata({
          authorizationServers: ['https://auth.example.com'],
        })).toThrow('Resource URL is required');
      });

      it('should throw error when authorization servers are missing', () => {
        expect(() => buildProtectedResourceMetadata({
          resourceUrl: 'https://resource.example.com',
        })).toThrow('At least one authorization server is required');
      });

      it('should throw error when authorization servers array is empty', () => {
        expect(() => buildProtectedResourceMetadata({
          resourceUrl: 'https://resource.example.com',
          authorizationServers: [],
        })).toThrow('At least one authorization server is required');
      });

      it('should not include scopes_supported when empty array provided', () => {
        const config: ProtectedResourceConfig = {
          resourceUrl: 'https://resource.example.com',
          authorizationServers: ['https://auth.example.com'],
          scopesSupported: [],
        };

        const metadata = buildProtectedResourceMetadata(config);

        expect(metadata.scopes_supported).toBeUndefined();
      });

      it('should not include bearer_methods_supported when empty array provided', () => {
        const config: ProtectedResourceConfig = {
          resourceUrl: 'https://resource.example.com',
          authorizationServers: ['https://auth.example.com'],
          bearerMethodsSupported: [],
        };

        const metadata = buildProtectedResourceMetadata(config);

        expect(metadata.bearer_methods_supported).toBeUndefined();
      });
    });
  });

  // =========================================================================
  // WWW-Authenticate Header Helpers
  // =========================================================================

  describe('WWW-Authenticate Header', () => {
    describe('buildWwwAuthenticateHeader', () => {
      it('should build basic header with resource_metadata', () => {
        const header = buildWwwAuthenticateHeader({
          resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
        });

        expect(header).toBe(
          'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource"'
        );
      });

      it('should include realm when provided', () => {
        const header = buildWwwAuthenticateHeader({
          realm: 'mcp',
          resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
        });

        expect(header).toContain('realm="mcp"');
        expect(header).toContain('resource_metadata=');
      });

      it('should include error when provided', () => {
        const header = buildWwwAuthenticateHeader({
          resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
          error: 'invalid_token',
        });

        expect(header).toContain('error="invalid_token"');
      });

      it('should include error_description when provided', () => {
        const header = buildWwwAuthenticateHeader({
          resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
          error: 'invalid_token',
          errorDescription: 'Token has expired',
        });

        expect(header).toContain('error_description="Token has expired"');
      });

      it('should include scope when provided', () => {
        const header = buildWwwAuthenticateHeader({
          resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
          error: 'insufficient_scope',
          scope: 'tools:execute',
        });

        expect(header).toContain('scope="tools:execute"');
      });

      it('should build complete header with all fields', () => {
        const header = buildWwwAuthenticateHeader({
          realm: 'mcp',
          resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
          error: 'insufficient_scope',
          errorDescription: 'Need execute permission',
          scope: 'tools:execute',
        });

        expect(header).toMatch(/^Bearer /);
        expect(header).toContain('realm="mcp"');
        expect(header).toContain('resource_metadata="https://example.com/.well-known/oauth-protected-resource"');
        expect(header).toContain('error="insufficient_scope"');
        expect(header).toContain('error_description="Need execute permission"');
        expect(header).toContain('scope="tools:execute"');
      });
    });

    describe('create401Response', () => {
      it('should set WWW-Authenticate header and return 401', () => {
        const mockRes = {
          setHeader: vi.fn().mockReturnThis(),
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
        };

        create401Response(mockRes as any, {
          resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
        });

        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'WWW-Authenticate',
          expect.stringContaining('Bearer')
        );
        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalled();
      });

      it('should include error in response body when provided', () => {
        const mockRes = {
          setHeader: vi.fn().mockReturnThis(),
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
        };

        create401Response(mockRes as any, {
          resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
          error: 'invalid_token',
          errorDescription: 'Token expired',
        });

        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'invalid_token',
          error_description: 'Token expired',
        });
      });

      it('should use default error values when not provided', () => {
        const mockRes = {
          setHeader: vi.fn().mockReturnThis(),
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
        };

        create401Response(mockRes as any, {
          resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
        });

        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'unauthorized',
          error_description: 'Authorization required',
        });
      });
    });
  });

  // =========================================================================
  // Express Router Integration
  // =========================================================================

  describe('Express Router Integration', () => {
    let app: Express;
    let server: Server | null = null;
    let port: number;

    beforeEach(() => {
      app = express();
      server = null;
    });

    afterEach(async () => {
      if (server) {
        await stopServer(server);
        server = null;
      }
    });

    describe('createProtectedResourceRouter', () => {
      it('should create router that serves metadata at well-known path', async () => {
        const router = createProtectedResourceRouter({
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
        });

        app.use(router);
        const result = await startServer(app);
        server = result.server;
        port = result.port;

        const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.resource).toBe('https://mcp-server.example.com');
        expect(body.authorization_servers).toEqual(['https://auth.example.com']);
      });

      it('should set correct Content-Type header', async () => {
        const router = createProtectedResourceRouter({
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
        });

        app.use(router);
        const result = await startServer(app);
        server = result.server;
        port = result.port;

        const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toMatch(/application\/json/);
      });

      it('should set Cache-Control header', async () => {
        const router = createProtectedResourceRouter({
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
        });

        app.use(router);
        const result = await startServer(app);
        server = result.server;
        port = result.port;

        const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`);
        expect(response.status).toBe(200);

        const cacheControl = response.headers.get('cache-control');
        expect(cacheControl).toContain('public');
        expect(cacheControl).toContain('max-age=3600');
      });

      it('should return 500 when config is invalid', async () => {
        // Create router with config that will fail at runtime
        // (empty config, no env vars set)
        const router = createProtectedResourceRouter({});

        app.use(router);
        const result = await startServer(app);
        server = result.server;
        port = result.port;

        const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`);
        expect(response.status).toBe(500);

        const body = await response.json();
        expect(body.error).toBe('server_error');
        expect(body.error_description).toContain('Resource URL is required');
      });
    });

    describe('registerProtectedResourceEndpoint', () => {
      it('should register endpoint on Express app', async () => {
        registerProtectedResourceEndpoint(app, {
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
        });

        const result = await startServer(app);
        server = result.server;
        port = result.port;

        const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.resource).toBe('https://mcp-server.example.com');
      });

      it('should include all default metadata fields', async () => {
        registerProtectedResourceEndpoint(app, {
          resourceUrl: 'https://mcp-server.example.com',
          authorizationServers: ['https://auth.example.com'],
        });

        const result = await startServer(app);
        server = result.server;
        port = result.port;

        const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body).toEqual({
          resource: 'https://mcp-server.example.com',
          authorization_servers: ['https://auth.example.com'],
          scopes_supported: ['tools:read', 'tools:execute', 'logging:write'],
          bearer_methods_supported: ['header'],
        });
      });
    });
  });

  // =========================================================================
  // Type Exports Verification
  // =========================================================================

  describe('Type Exports', () => {
    it('should export ProtectedResourceMetadata interface', () => {
      // TypeScript compile-time check - this verifies the type is exported
      const metadata: ProtectedResourceMetadata = {
        resource: 'https://example.com',
        authorization_servers: ['https://auth.example.com'],
      };
      expect(metadata).toBeDefined();
    });

    it('should export ProtectedResourceConfig interface', () => {
      const config: ProtectedResourceConfig = {
        resourceUrl: 'https://example.com',
        authorizationServers: ['https://auth.example.com'],
      };
      expect(config).toBeDefined();
    });

    it('should export WwwAuthenticateOptions interface', () => {
      const options: WwwAuthenticateOptions = {
        resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
        realm: 'mcp',
      };
      expect(options).toBeDefined();
    });

    it('should export OAuthServerMetadata interface', () => {
      const metadata: OAuthServerMetadata = {
        issuer: 'https://auth.example.com',
        authorizationEndpoint: 'https://auth.example.com/authorize',
        tokenEndpoint: 'https://auth.example.com/token',
        responseTypesSupported: ['code'],
      };
      expect(metadata).toBeDefined();
    });
  });
});
