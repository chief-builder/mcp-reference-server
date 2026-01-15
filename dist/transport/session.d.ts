/**
 * Session management for HTTP transport
 */
export interface Session {
    id: string;
    createdAt: Date;
    lastActiveAt: Date;
    metadata?: Record<string, unknown>;
}
export interface SessionManagerOptions {
    ttlMs?: number;
    cleanupIntervalMs?: number;
}
export declare class SessionManager {
    private readonly sessions;
    constructor(_options?: SessionManagerOptions);
    getSessions(): Map<string, Session>;
    createSession(): Session;
    getSession(_id: string): Session | undefined;
    destroySession(_id: string): boolean;
    cleanup(): void;
}
//# sourceMappingURL=session.d.ts.map