/**
 * Progress notification handling with rate limiting
 *
 * Implements MCP progress notifications with configurable throttling
 * to prevent flooding the client with too many updates.
 */
import { z } from 'zod';
import { createNotification } from './jsonrpc.js';
// =============================================================================
// Constants
// =============================================================================
export const PROGRESS_NOTIFICATION_METHOD = 'notifications/progress';
// =============================================================================
// Zod Schemas
// =============================================================================
/**
 * Progress token schema - can be string or number
 */
export const ProgressTokenSchema = z.union([z.string(), z.number()]);
/**
 * Progress notification params schema
 */
export const ProgressNotificationParamsSchema = z.object({
    progressToken: ProgressTokenSchema,
    progress: z.number(),
    total: z.number().optional(),
    message: z.string().optional(),
});
/**
 * Request _meta field schema containing optional progressToken
 */
export const RequestMetaSchema = z.object({
    progressToken: ProgressTokenSchema.optional(),
}).passthrough();
// =============================================================================
// Helper Functions
// =============================================================================
/**
 * Extract progressToken from request params _meta field
 *
 * @param params - Request params object
 * @returns Progress token if present, undefined otherwise
 */
export function extractProgressToken(params) {
    if (!params || typeof params !== 'object') {
        return undefined;
    }
    const meta = params['_meta'];
    if (!meta || typeof meta !== 'object') {
        return undefined;
    }
    const metaObj = meta;
    const token = metaObj['progressToken'];
    if (token === undefined || token === null) {
        return undefined;
    }
    // Validate token type
    const result = ProgressTokenSchema.safeParse(token);
    if (!result.success) {
        return undefined;
    }
    return result.data;
}
/**
 * Create a progress notification
 */
export function createProgressNotification(progressToken, progress, total, message) {
    const params = {
        progressToken,
        progress,
    };
    if (total !== undefined) {
        params.total = total;
    }
    if (message !== undefined) {
        params.message = message;
    }
    return createNotification(PROGRESS_NOTIFICATION_METHOD, params);
}
// =============================================================================
// ProgressReporter Class
// =============================================================================
/**
 * Reports progress notifications with rate limiting
 *
 * Throttles progress updates to prevent flooding the client.
 * Always emits the final notification on complete().
 */
export class ProgressReporter {
    token;
    sendNotification;
    throttleMs;
    lastEmitTime = 0;
    pendingProgress = null;
    completed = false;
    constructor(token, sendNotification, options) {
        this.token = token;
        this.sendNotification = sendNotification;
        this.throttleMs = options?.throttleMs ?? 100;
    }
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
    report(progress, total, message) {
        if (this.completed) {
            return;
        }
        const now = Date.now();
        const timeSinceLastEmit = now - this.lastEmitTime;
        if (timeSinceLastEmit >= this.throttleMs) {
            // Enough time has passed, emit immediately
            this.emit(progress, total, message);
        }
        else {
            // Store for later (will be emitted on next report or complete)
            const pending = { progress };
            if (total !== undefined) {
                pending.total = total;
            }
            if (message !== undefined) {
                pending.message = message;
            }
            this.pendingProgress = pending;
        }
    }
    /**
     * Force final progress report (bypasses throttle)
     *
     * Should be called when the operation is complete.
     * Emits any pending progress or a final notification.
     *
     * @param message - Optional completion message
     */
    complete(message) {
        if (this.completed) {
            return;
        }
        this.completed = true;
        // Use pending progress values if available, with optional message override
        if (this.pendingProgress) {
            this.emit(this.pendingProgress.progress, this.pendingProgress.total, message ?? this.pendingProgress.message);
        }
        else if (message !== undefined) {
            // If only message provided, emit a notification with message only
            // Use 100% progress as a sensible default for completion
            this.emit(100, 100, message);
        }
    }
    /**
     * Emit a progress notification
     */
    emit(progress, total, message) {
        const notification = createProgressNotification(this.token, progress, total, message);
        this.sendNotification(notification);
        this.lastEmitTime = Date.now();
        this.pendingProgress = null;
    }
}
// =============================================================================
// Factory Function
// =============================================================================
/**
 * Create a ProgressReporter if the request has a progress token
 *
 * @param params - Request params that may contain _meta.progressToken
 * @param sendNotification - Function to send notifications
 * @param options - Optional configuration
 * @returns ProgressReporter if token present, undefined otherwise
 */
export function createProgressReporter(params, sendNotification, options) {
    const token = extractProgressToken(params);
    if (token === undefined) {
        return undefined;
    }
    return new ProgressReporter(token, sendNotification, options);
}
//# sourceMappingURL=progress.js.map