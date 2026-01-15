/**
 * OAuth metadata discovery endpoints
 *
 * Implements:
 * - OAuth Authorization Server Metadata (RFC 8414)
 * - OAuth Protected Resource Metadata (RFC 9728)
 */
import { Router, Response } from 'express';
export interface OAuthServerMetadata {
    issuer: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    tokenEndpointAuthMethodsSupported?: string[];
    jwksUri?: string;
    registrationEndpoint?: string;
    scopesSupported?: string[];
    responseTypesSupported: string[];
    grantTypesSupported?: string[];
    codeChallengeMethodsSupported?: string[];
}
/**
 * Protected Resource Metadata as defined in RFC 9728
 */
export interface ProtectedResourceMetadata {
    /**
     * The protected resource's resource identifier URL
     */
    resource: string;
    /**
     * Array of authorization server issuer identifiers
     */
    authorization_servers: string[];
    /**
     * Array of OAuth scopes supported by this resource
     */
    scopes_supported?: string[];
    /**
     * Methods for presenting bearer tokens supported by this resource
     * e.g., ['header', 'body', 'query']
     */
    bearer_methods_supported?: string[];
    /**
     * JWS algorithms supported for resource request signing
     */
    resource_signing_alg_values_supported?: string[];
}
/**
 * Configuration options for Protected Resource Metadata
 */
export interface ProtectedResourceConfig {
    /**
     * The resource identifier URL. Defaults to MCP_RESOURCE_URL env var.
     */
    resourceUrl?: string;
    /**
     * Authorization server(s). Defaults to MCP_AUTH_SERVERS env var (comma-separated).
     */
    authorizationServers?: string[];
    /**
     * Scopes supported by this resource.
     * Defaults to ['tools:read', 'tools:execute', 'logging:write']
     */
    scopesSupported?: string[];
    /**
     * Bearer methods supported. Defaults to ['header']
     */
    bearerMethodsSupported?: string[];
}
export declare const WELL_KNOWN_OAUTH_SERVER = "/.well-known/oauth-authorization-server";
export declare const WELL_KNOWN_PROTECTED_RESOURCE = "/.well-known/oauth-protected-resource";
export declare function getWellKnownPath(): string;
export declare function buildMetadata(issuer: string): OAuthServerMetadata;
/**
 * Build Protected Resource Metadata document
 */
export declare function buildProtectedResourceMetadata(config: ProtectedResourceConfig): ProtectedResourceMetadata;
/**
 * Get the well-known path for Protected Resource Metadata
 */
export declare function getProtectedResourceWellKnownPath(): string;
/**
 * Options for building WWW-Authenticate header
 */
export interface WwwAuthenticateOptions {
    /**
     * The realm for the protected resource
     */
    realm?: string;
    /**
     * URL to the resource metadata document
     */
    resourceMetadataUrl: string;
    /**
     * Error code (optional, for error responses)
     */
    error?: 'invalid_token' | 'insufficient_scope' | 'invalid_request';
    /**
     * Human-readable error description (optional)
     */
    errorDescription?: string;
    /**
     * Required scope(s) for the resource (optional)
     */
    scope?: string;
}
/**
 * Build WWW-Authenticate header value for Bearer authentication
 *
 * Per RFC 9728, this should include resource_metadata parameter
 */
export declare function buildWwwAuthenticateHeader(options: WwwAuthenticateOptions): string;
/**
 * Create a 401 Unauthorized response with proper WWW-Authenticate header
 */
export declare function create401Response(res: Response, options: WwwAuthenticateOptions): void;
/**
 * Create an Express router with Protected Resource Metadata endpoint
 */
export declare function createProtectedResourceRouter(config: ProtectedResourceConfig): Router;
/**
 * Register Protected Resource Metadata endpoint on an Express app
 */
export declare function registerProtectedResourceEndpoint(app: {
    use: (router: Router) => void;
}, config: ProtectedResourceConfig): void;
//# sourceMappingURL=discovery.d.ts.map