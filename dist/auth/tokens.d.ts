/**
 * Token validation and refresh
 */
export interface TokenPayload {
    sub: string;
    iss: string;
    aud: string | string[];
    exp: number;
    iat: number;
    scope?: string;
    [key: string]: unknown;
}
export interface TokenValidationOptions {
    issuer: string;
    audience: string | string[];
    clockTolerance?: number;
}
export declare function validateAccessToken(_token: string, _options: TokenValidationOptions): Promise<TokenPayload>;
export declare function refreshAccessToken(_refreshToken: string, _tokenEndpoint: string): Promise<{
    accessToken: string;
    refreshToken?: string;
}>;
export declare function isTokenExpired(payload: TokenPayload, toleranceSeconds?: number): boolean;
//# sourceMappingURL=tokens.d.ts.map