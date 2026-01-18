/**
 * M2M OAuth extension implementation
 *
 * Extension name: anthropic/oauth-m2m
 * Provides OAuth 2.0 Machine-to-Machine authentication for MCP servers.
 *
 * Implements:
 * - Client Credentials Grant (RFC 6749 Section 4.4)
 * - client_secret_basic authentication (Base64 encoded in Authorization header)
 * - client_secret_post authentication (credentials in request body)
 * - Token caching until expiration
 * - Auth0 audience/resource parameter support
 *
 * Security:
 * - No client_secret logging
 * - Secure credential handling
 */
import { z } from 'zod';
import { TokenRefresher } from '../auth/tokens.js';
// =============================================================================
// Constants
// =============================================================================
export const OAUTH_M2M_EXTENSION_NAME = 'anthropic/oauth-m2m';
export const OAUTH_M2M_EXTENSION_VERSION = '1.0.0';
/** Default buffer time (in seconds) before token expiry to trigger refresh */
const DEFAULT_EXPIRY_BUFFER_SECONDS = 60;
// =============================================================================
// Zod Schemas
// =============================================================================
export const M2MClientConfigSchema = z.object({
    /** OAuth token endpoint URL */
    tokenEndpoint: z.string().url(),
    /** OAuth client ID */
    clientId: z.string().min(1),
    /** OAuth client secret */
    clientSecret: z.string().min(1),
    /** Client authentication method */
    authMethod: z.enum(['client_secret_basic', 'client_secret_post']).default('client_secret_basic'),
    /** OAuth scopes to request */
    scopes: z.array(z.string()).optional(),
    /** Audience parameter (Auth0-specific, also used for resource indicator) */
    audience: z.string().optional(),
    /** Buffer time in seconds before expiry to trigger refresh */
    expiryBufferSeconds: z.number().int().min(0).default(DEFAULT_EXPIRY_BUFFER_SECONDS),
});
export const M2MTokenResponseSchema = z.object({
    /** The access token */
    access_token: z.string(),
    /** Token type - always Bearer */
    token_type: z.literal('Bearer'),
    /** Token expiration in seconds */
    expires_in: z.number().int().positive().optional(),
    /** Granted scopes (space-separated) */
    scope: z.string().optional(),
});
export const M2MTokenErrorSchema = z.object({
    error: z.string(),
    error_description: z.string().optional(),
    error_uri: z.string().url().optional(),
});
// =============================================================================
// Error Classes
// =============================================================================
/**
 * M2M OAuth error
 */
export class M2MAuthError extends Error {
    errorCode;
    errorUri;
    constructor(errorCode, message, errorUri) {
        super(message);
        this.errorCode = errorCode;
        this.errorUri = errorUri;
        this.name = 'M2MAuthError';
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
    static fromTokenError(response) {
        return new M2MAuthError(response.error, response.error_description ?? response.error, response.error_uri);
    }
}
// =============================================================================
// M2M Client
// =============================================================================
/**
 * OAuth 2.0 Machine-to-Machine client implementing client credentials flow.
 *
 * Features:
 * - Client credentials grant (RFC 6749 Section 4.4)
 * - Support for client_secret_basic and client_secret_post authentication
 * - Automatic token caching until expiration
 * - Auth0 audience parameter support
 * - No refresh tokens (per spec - get new token when expired)
 *
 * Security:
 * - Client secret is never logged
 * - Credentials are stored securely in memory
 */
export class M2MClient {
    config;
    cachedToken;
    tokenRefresher = new TokenRefresher();
    constructor(config) {
        this.config = M2MClientConfigSchema.parse(config);
    }
    /**
     * Get the client configuration (without exposing the secret).
     */
    getConfig() {
        const { clientSecret: _, ...safeConfig } = this.config;
        return safeConfig;
    }
    /**
     * Get a valid access token, fetching a new one if necessary.
     *
     * This method:
     * 1. Returns cached token if still valid
     * 2. Fetches new token using client credentials if expired
     * 3. Deduplicates concurrent token requests
     *
     * @param options - Optional overrides for this request
     * @returns The access token string
     * @throws {M2MAuthError} If token request fails
     */
    async getAccessToken(options) {
        // Check if we have a valid cached token (without overrides)
        if (!options && this.isTokenValid()) {
            return this.cachedToken.accessToken;
        }
        // If options are provided, always fetch a new token (no caching)
        if (options) {
            const response = await this.requestToken(options);
            return response.accessToken;
        }
        // Use TokenRefresher to deduplicate concurrent requests
        return this.tokenRefresher.refresh(() => this.fetchAndCacheToken());
    }
    /**
     * Check if the cached token is still valid.
     *
     * @returns true if token exists and is not expired (considering buffer)
     */
    isTokenValid() {
        if (!this.cachedToken) {
            return false;
        }
        const bufferMs = this.config.expiryBufferSeconds * 1000;
        return Date.now() < this.cachedToken.expiresAt - bufferMs;
    }
    /**
     * Clear the cached token.
     * Useful when token is rejected or needs to be refreshed.
     */
    clearCache() {
        this.cachedToken = undefined;
        this.tokenRefresher.clear();
    }
    /**
     * Get token expiration time (if cached).
     *
     * @returns Expiration timestamp in milliseconds, or undefined if no token
     */
    getTokenExpiration() {
        return this.cachedToken?.expiresAt;
    }
    // ===========================================================================
    // Private Methods
    // ===========================================================================
    /**
     * Fetch a new token and cache it.
     */
    async fetchAndCacheToken() {
        const response = await this.requestToken();
        const now = Date.now();
        const expiresIn = response.expiresIn ?? 3600; // Default to 1 hour
        this.cachedToken = {
            accessToken: response.accessToken,
            expiresAt: now + expiresIn * 1000,
            scope: response.scope,
        };
        return response.accessToken;
    }
    /**
     * Request a new token from the token endpoint.
     */
    async requestToken(options) {
        const body = new URLSearchParams();
        body.set('grant_type', 'client_credentials');
        // Add scopes if provided
        const scopes = options?.scopes ?? this.config.scopes;
        if (scopes && scopes.length > 0) {
            body.set('scope', scopes.join(' '));
        }
        // Add audience (Auth0-specific)
        const audience = options?.audience ?? this.config.audience;
        if (audience) {
            body.set('audience', audience);
        }
        // Build headers
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        };
        // Add client authentication based on method
        if (this.config.authMethod === 'client_secret_basic') {
            // RFC 6749 Section 2.3.1 - HTTP Basic Authentication
            const credentials = Buffer.from(`${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
        }
        else {
            // client_secret_post - credentials in request body
            body.set('client_id', this.config.clientId);
            body.set('client_secret', this.config.clientSecret);
        }
        const response = await fetch(this.config.tokenEndpoint, {
            method: 'POST',
            headers,
            body: body.toString(),
        });
        const responseBody = await response.json();
        if (!response.ok) {
            const errorResponse = M2MTokenErrorSchema.safeParse(responseBody);
            if (errorResponse.success) {
                throw M2MAuthError.fromTokenError(errorResponse.data);
            }
            throw new M2MAuthError('server_error', `Token request failed with status ${response.status}`);
        }
        const tokenResponse = M2MTokenResponseSchema.parse(responseBody);
        return this.normalizeTokenResponse(tokenResponse);
    }
    /**
     * Normalize token response from snake_case to camelCase.
     */
    normalizeTokenResponse(response) {
        const result = {
            accessToken: response.access_token,
            tokenType: response.token_type,
        };
        if (response.expires_in !== undefined) {
            result.expiresIn = response.expires_in;
        }
        if (response.scope !== undefined) {
            result.scope = response.scope;
        }
        return result;
    }
}
// =============================================================================
// Auth0 Client Factory
// =============================================================================
/**
 * Create an M2M client configured for Auth0.
 *
 * @param domain - Auth0 domain (e.g., 'your-tenant.auth0.com')
 * @param clientId - OAuth client ID
 * @param clientSecret - OAuth client secret
 * @param options - Additional options
 * @returns Configured M2M client
 */
export function createAuth0M2MClient(domain, clientId, clientSecret, options = {}) {
    // Normalize domain to token endpoint URL
    const baseUrl = domain.startsWith('https://') ? domain : `https://${domain}`;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const tokenEndpoint = `${normalizedBase}/oauth/token`;
    const config = {
        tokenEndpoint,
        clientId,
        clientSecret,
        // Auth0 typically uses client_secret_post
        authMethod: options.authMethod ?? 'client_secret_post',
    };
    // Only add optional properties if they have values
    if (options.audience) {
        config.audience = options.audience;
    }
    if (options.scopes) {
        config.scopes = options.scopes;
    }
    return new M2MClient(config);
}
// =============================================================================
// Extension Factory
// =============================================================================
/**
 * Create the anthropic/oauth-m2m extension.
 *
 * @param config OAuth M2M configuration
 * @returns Extension instance
 */
export function createOAuthM2MExtension(config) {
    // Create the M2M client
    const client = new M2MClient(config);
    // Settings to advertise to clients
    const settings = {
        grantTypes: ['client_credentials'],
        tokenEndpoint: config.tokenEndpoint,
        authMethods: ['client_secret_basic', 'client_secret_post'],
    };
    return {
        name: OAUTH_M2M_EXTENSION_NAME,
        version: OAUTH_M2M_EXTENSION_VERSION,
        description: 'OAuth 2.0 Machine-to-Machine authentication extension',
        settings,
        async onInitialize(_clientSettings) {
            // Pre-validate the configuration by attempting to get a token
            // This helps catch configuration errors early
            try {
                await client.getAccessToken();
            }
            catch (error) {
                // Log error without exposing secrets
                const safeConfig = client.getConfig();
                console.error(`M2M OAuth initialization failed for client ${safeConfig.clientId} at ${safeConfig.tokenEndpoint}:`, error instanceof Error ? error.message : 'Unknown error');
                throw error;
            }
        },
        async onShutdown() {
            // Clear cached tokens on shutdown
            client.clearCache();
        },
    };
}
/**
 * Create a placeholder OAuth M2M extension without configuration.
 * Used for capability advertisement when actual config isn't available.
 *
 * @returns Extension instance with minimal settings
 */
export function createOAuthM2MPlaceholder() {
    return {
        name: OAUTH_M2M_EXTENSION_NAME,
        version: OAUTH_M2M_EXTENSION_VERSION,
        description: 'OAuth 2.0 Machine-to-Machine authentication extension',
        settings: {
            grantTypes: ['client_credentials'],
            authMethods: ['client_secret_basic', 'client_secret_post'],
        },
        async onInitialize(_clientSettings) {
            // Placeholder - no-op
        },
        async onShutdown() {
            // Placeholder - no-op
        },
    };
}
// =============================================================================
// Export M2M Client Factory for External Use
// =============================================================================
/**
 * Create an M2M client with custom configuration.
 *
 * @param config - Client configuration
 * @returns Configured M2M client
 */
export function createM2MClient(config) {
    return new M2MClient(config);
}
//# sourceMappingURL=oauth-m2m.js.map