/**
 * OAuth metadata discovery endpoints
 */
export function getWellKnownPath() {
    return '/.well-known/oauth-authorization-server';
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
//# sourceMappingURL=discovery.js.map