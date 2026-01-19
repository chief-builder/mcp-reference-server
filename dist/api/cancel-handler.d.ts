/**
 * Cancel API Handler
 *
 * POST /api/cancel endpoint to abort in-progress chat generation.
 */
import { Request, Response } from 'express';
export declare const activeControllers: Map<string, AbortController>;
export interface CancelRequest {
    sessionId: string;
}
/**
 * Handle POST /api/cancel
 */
export declare function handleCancel(req: Request, res: Response): void;
//# sourceMappingURL=cancel-handler.d.ts.map