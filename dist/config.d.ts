/**
 * Environment configuration loader
 */
export interface Config {
    serverName: string;
    serverVersion: string;
    port: number;
    host: string;
    transport: 'stdio' | 'http';
    authEnabled: boolean;
    oauthIssuer: string | undefined;
    oauthClientId: string | undefined;
    oauthClientSecret: string | undefined;
    otelEnabled: boolean;
    otelEndpoint: string | undefined;
    otelServiceName: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}
export declare function loadConfig(): Config;
//# sourceMappingURL=config.d.ts.map