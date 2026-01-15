/**
 * OAuth metadata discovery endpoints
 *
 * Implements:
 * - OAuth Authorization Server Metadata (RFC 8414)
 * - OAuth Protected Resource Metadata (RFC 9728)
 */
import { Router } from 'express';
// =============================================================================
// Constants
// =============================================================================
export const WELL_KNOWN_OAUTH_SERVER = '/.well-known/oauth-authorization-server';
export const WELL_KNOWN_PROTECTED_RESOURCE = '/.well-known/oauth-protected-resource';
const DEFAULT_SCOPES = ['tools:read', 'tools:execute', 'logging:write'];
const DEFAULT_BEARER_METHODS = ['header'];
// =============================================================================
// OAuth Authorization Server Metadata (RFC 8414)
// =============================================================================
export function getWellKnownPath() {
    return WELL_KNOWN_OAUTH_SERVER;
}
export function buildMetadata(issuer) {
    return {
        issuer,
        authorizationEndpoint: `${issuer}/authorize`,
        tokenEndpoint: `${issuer}/token`,
        tokenEndpointAuthMethodsSupported: ['client_secret_basic', 'client_secret_post', 'none'],
        responseTypesSupported: ['code'],
        grantTypesSupported: ['authorization_code', 'refresh_token', 'client_credentials'],
        codeChallengeMethodsSupported: ['S256'],
    };
}
// =============================================================================
// Protected Resource Metadata (RFC 9728)
// =============================================================================
/**
 * Get configuration from environment variables
 */
function getConfigFromEnv() {
    const resourceUrl = process.env.MCP_RESOURCE_URL;
    const authServersEnv = process.env.MCP_AUTH_SERVERS;
    return {
        resourceUrl,
        authorizationServers: authServersEnv
            ? authServersEnv.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
    };
}
/**
 * Build Protected Resource Metadata document
 */
export function buildProtectedResourceMetadata(config) {
    const envConfig = getConfigFromEnv();
    const resourceUrl = config.resourceUrl ?? envConfig.resourceUrl;
    const authorizationServers = config.authorizationServers ?? envConfig.authorizationServers;
    if (!resourceUrl) {
        throw new Error('Resource URL is required. Set MCP_RESOURCE_URL environment variable or pass resourceUrl in config.');
    }
    if (!authorizationServers || authorizationServers.length === 0) {
        throw new Error('At least one authorization server is required. Set MCP_AUTH_SERVERS environment variable or pass authorizationServers in config.');
    }
    const metadata = {
        resource: resourceUrl,
        authorization_servers: authorizationServers,
    };
    // Add optional fields
    const scopes = config.scopesSupported ?? DEFAULT_SCOPES;
    if (scopes.length > 0) {
        metadata.scopes_supported = scopes;
    }
    const bearerMethods = config.bearerMethodsSupported ?? DEFAULT_BEARER_METHODS;
    if (bearerMethods.length > 0) {
        metadata.bearer_methods_supported = bearerMethods;
    }
    return metadata;
}
/**
 * Get the well-known path for Protected Resource Metadata
 */
export function getProtectedResourceWellKnownPath() {
    return WELL_KNOWN_PROTECTED_RESOURCE;
}
/**
 * Build WWW-Authenticate header value for Bearer authentication
 *
 * Per RFC 9728, this should include resource_metadata parameter
 */
export function buildWwwAuthenticateHeader(options) {
    const parts = [];
    if (options.realm) {
        parts.push(`realm="${options.realm}"`);
    }
    // RFC 9728 requires resource_metadata parameter
    parts.push(`resource_metadata="${options.resourceMetadataUrl}"`);
    if (options.error) {
        parts.push(`error="${options.error}"`);
    }
    if (options.errorDescription) {
        parts.push(`error_description="${options.errorDescription}"`);
    }
    if (options.scope) {
        parts.push(`scope="${options.scope}"`);
    }
    return `Bearer ${parts.join(', ')}`;
}
/**
 * Create a 401 Unauthorized response with proper WWW-Authenticate header
 */
export function create401Response(res, options) {
    const wwwAuthenticate = buildWwwAuthenticateHeader(options);
    res.setHeader('WWW-Authenticate', wwwAuthenticate);
    res.status(401).json({
        error: options.error ?? 'unauthorized',
        error_description: options.errorDescription ?? 'Authorization required',
    });
}
// =============================================================================
// Express Router Integration
// =============================================================================
/**
 * Create an Express router with Protected Resource Metadata endpoint
 */
export function createProtectedResourceRouter(config) {
    const router = Router();
    router.get(WELL_KNOWN_PROTECTED_RESOURCE, (_req, res) => {
        try {
            const metadata = buildProtectedResourceMetadata(config);
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.status(200).json(metadata);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Configuration error';
            res.status(500).json({
                error: 'server_error',
                error_description: message,
            });
        }
    });
    return router;
}
/**
 * Register Protected Resource Metadata endpoint on an Express app
 */
export function registerProtectedResourceEndpoint(app, config) {
    const router = createProtectedResourceRouter(config);
    app.use(router);
}
//# sourceMappingURL=discovery.js.map