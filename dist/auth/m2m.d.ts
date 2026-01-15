/**
 * Machine-to-Machine (M2M) OAuth extension
 */
export interface M2MClientConfig {
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
    scopes?: string[];
}
export interface M2MTokenResponse {
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
    scope?: string;
}
export declare class M2MClient {
    private tokenCache?;
    private readonly config;
    constructor(config: M2MClientConfig);
    getConfig(): M2MClientConfig;
    getAccessToken(): Promise<string>;
    private requestToken;
}
//# sourceMappingURL=m2m.d.ts.map