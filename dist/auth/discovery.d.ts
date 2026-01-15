/**
 * OAuth metadata discovery endpoints
 */
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
export declare function getWellKnownPath(): string;
export declare function buildMetadata(issuer: string): OAuthServerMetadata;
//# sourceMappingURL=discovery.d.ts.map