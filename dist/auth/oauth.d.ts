/**
 * OAuth 2.1 core implementation
 */
export interface OAuthConfig {
    issuer: string;
    clientId: string;
    clientSecret?: string;
    redirectUri?: string;
    scopes?: string[];
}
export interface AuthorizationRequest {
    responseType: 'code';
    clientId: string;
    redirectUri: string;
    scope?: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: 'S256';
}
export interface TokenRequest {
    grantType: 'authorization_code' | 'refresh_token' | 'client_credentials';
    code?: string;
    redirectUri?: string;
    codeVerifier?: string;
    refreshToken?: string;
    scope?: string;
}
export interface TokenResponse {
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn?: number;
    refreshToken?: string;
    scope?: string;
}
export declare class OAuthHandler {
    constructor(_config: OAuthConfig);
    authorize(_request: AuthorizationRequest): Promise<string>;
    token(_request: TokenRequest): Promise<TokenResponse>;
}
//# sourceMappingURL=oauth.d.ts.map