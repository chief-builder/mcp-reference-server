/**
 * Environment configuration loader with Zod validation
 */
import { z } from 'zod';
/**
 * Configuration schema with validation rules
 */
/** Default pagination page size */
export declare const MCP_PAGINATION_DEFAULT = 50;
/** Maximum pagination page size */
export declare const MCP_PAGINATION_MAX = 200;
export declare const ConfigSchema: z.ZodObject<{
    port: z.ZodDefault<z.ZodNumber>;
    host: z.ZodDefault<z.ZodString>;
    transport: z.ZodDefault<z.ZodEnum<["stdio", "http", "both"]>>;
    statelessMode: z.ZodDefault<z.ZodBoolean>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    maxPageSize: z.ZodDefault<z.ZodNumber>;
    requestTimeoutMs: z.ZodDefault<z.ZodNumber>;
    shutdownTimeoutMs: z.ZodDefault<z.ZodNumber>;
    progressIntervalMs: z.ZodDefault<z.ZodNumber>;
    debug: z.ZodDefault<z.ZodBoolean>;
    logLevel: z.ZodDefault<z.ZodEnum<["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]>>;
    auth0: z.ZodDefault<z.ZodObject<{
        domain: z.ZodOptional<z.ZodString>;
        audience: z.ZodOptional<z.ZodString>;
        clientId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        domain?: string | undefined;
        audience?: string | undefined;
        clientId?: string | undefined;
    }, {
        domain?: string | undefined;
        audience?: string | undefined;
        clientId?: string | undefined;
    }>>;
    m2mClientSecret: z.ZodOptional<z.ZodString>;
    otelEndpoint: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    port: number;
    host: string;
    transport: "stdio" | "http" | "both";
    statelessMode: boolean;
    pageSize: number;
    maxPageSize: number;
    requestTimeoutMs: number;
    shutdownTimeoutMs: number;
    progressIntervalMs: number;
    debug: boolean;
    logLevel: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
    auth0: {
        domain?: string | undefined;
        audience?: string | undefined;
        clientId?: string | undefined;
    };
    m2mClientSecret?: string | undefined;
    otelEndpoint?: string | undefined;
}, {
    port?: number | undefined;
    host?: string | undefined;
    transport?: "stdio" | "http" | "both" | undefined;
    statelessMode?: boolean | undefined;
    pageSize?: number | undefined;
    maxPageSize?: number | undefined;
    requestTimeoutMs?: number | undefined;
    shutdownTimeoutMs?: number | undefined;
    progressIntervalMs?: number | undefined;
    debug?: boolean | undefined;
    logLevel?: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency" | undefined;
    auth0?: {
        domain?: string | undefined;
        audience?: string | undefined;
        clientId?: string | undefined;
    } | undefined;
    m2mClientSecret?: string | undefined;
    otelEndpoint?: string | undefined;
}>;
/**
 * Configuration type inferred from schema
 */
export type Config = z.infer<typeof ConfigSchema>;
/**
 * Load configuration from environment variables
 */
export declare function loadConfig(): Config;
/**
 * Get the current configuration (singleton)
 * Loads from environment on first call
 */
export declare function getConfig(): Config;
/**
 * Force reload configuration from environment
 */
export declare function reloadConfig(): Config;
/**
 * Reset config singleton (for testing)
 */
export declare function resetConfig(): void;
//# sourceMappingURL=config.d.ts.map