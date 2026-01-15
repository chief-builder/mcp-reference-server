/**
 * Progress notification handling with rate limiting
 *
 * Implements MCP progress notifications with configurable throttling
 * to prevent flooding the client with too many updates.
 */
import { z } from 'zod';
import { type JsonRpcNotification } from './jsonrpc.js';
export declare const PROGRESS_NOTIFICATION_METHOD: "notifications/progress";
/**
 * Progress token schema - can be string or number
 */
export declare const ProgressTokenSchema: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
/**
 * Progress notification params schema
 */
export declare const ProgressNotificationParamsSchema: z.ZodObject<{
    progressToken: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    progress: z.ZodNumber;
    total: z.ZodOptional<z.ZodNumber>;
    message: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    progressToken: string | number;
    progress: number;
    message?: string | undefined;
    total?: number | undefined;
}, {
    progressToken: string | number;
    progress: number;
    message?: string | undefined;
    total?: number | undefined;
}>;
/**
 * Request _meta field schema containing optional progressToken
 */
export declare const RequestMetaSchema: z.ZodObject<{
    progressToken: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    progressToken: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    progressToken: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
}, z.ZodTypeAny, "passthrough">>;
export type ProgressToken = z.infer<typeof ProgressTokenSchema>;
export type ProgressNotificationParams = z.infer<typeof ProgressNotificationParamsSchema>;
export type RequestMeta = z.infer<typeof RequestMetaSchema>;
/**
 * Options for ProgressReporter
 */
export interface ProgressReporterOptions {
    /** Throttle interval in milliseconds (default: 100ms) */
    throttleMs?: number;
}
/**
 * Function type for sending notifications
 */
export type SendNotificationFn = (notification: JsonRpcNotification) => void;
/**
 * Extract progressToken from request params _meta field
 *
 * @param params - Request params object
 * @returns Progress token if present, undefined otherwise
 */
export declare function extractProgressToken(params: Record<string, unknown> | undefined): ProgressToken | undefined;
/**
 * Create a progress notification
 */
export declare function createProgressNotification(progressToken: ProgressToken, progress: number, total?: number, message?: string): JsonRpcNotification;
/**
 * Reports progress notifications with rate limiting
 *
 * Throttles progress updates to prevent flooding the client.
 * Always emits the final notification on complete().
 */
export declare class ProgressReporter {
    private readonly token;
    private readonly sendNotification;
    private readonly throttleMs;
    private lastEmitTime;
    private pendingProgress;
    private completed;
    constructor(token: ProgressToken, sendNotification: SendNotificationFn, options?: ProgressReporterOptions);
    /**
     * Report progress (throttled)
     *
     * Updates are throttled to the configured interval.
     * If called more frequently, only the most recent values are kept.
     *
     * @param progress - Current progress value
     * @param total - Optional total value for calculating percentage
     * @param message - Optional message describing current progress
     */
    report(progress: number, total?: number, message?: string): void;
    /**
     * Force final progress report (bypasses throttle)
     *
     * Should be called when the operation is complete.
     * Emits any pending progress or a final notification.
     *
     * @param message - Optional completion message
     */
    complete(message?: string): void;
    /**
     * Emit a progress notification
     */
    private emit;
}
/**
 * Create a ProgressReporter if the request has a progress token
 *
 * @param params - Request params that may contain _meta.progressToken
 * @param sendNotification - Function to send notifications
 * @param options - Optional configuration
 * @returns ProgressReporter if token present, undefined otherwise
 */
export declare function createProgressReporter(params: Record<string, unknown> | undefined, sendNotification: SendNotificationFn, options?: ProgressReporterOptions): ProgressReporter | undefined;
//# sourceMappingURL=progress.d.ts.map