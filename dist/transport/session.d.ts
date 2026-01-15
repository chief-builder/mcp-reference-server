/**
 * Session management for HTTP transport
 *
 * Implements session ID generation and lifecycle management for MCP sessions.
 * Session IDs are cryptographically secure using crypto.randomUUID.
 */
import type { ClientCapabilities, ServerState } from '../protocol/lifecycle.js';
export interface Session {
    id: string;
    createdAt: Date;
    lastActiveAt: Date;
    state: ServerState;
    clientInfo?: {
        name: string;
        version: string;
    };
    clientCapabilities?: ClientCapabilities;
    metadata?: Record<string, unknown>;
}
export interface SessionManagerOptions {
    /**
     * Time-to-live for sessions in milliseconds.
     * Sessions inactive for longer than this will be cleaned up.
     * Default: 30 minutes
     */
    ttlMs?: number;
    /**
     * Interval for running cleanup of expired sessions in milliseconds.
     * Default: 5 minutes
     */
    cleanupIntervalMs?: number;
}
/**
 * Generates a cryptographically secure session ID.
 * Uses visible ASCII characters (0x21-0x7E) per MCP specification.
 */
export declare function generateSessionId(): string;
export declare class SessionManager {
    private readonly sessions;
    private readonly ttlMs;
    private readonly cleanupIntervalMs;
    private cleanupTimer;
    constructor(options?: SessionManagerOptions);
    /**
     * Start automatic cleanup of expired sessions
     */
    startCleanup(): void;
    /**
     * Stop automatic cleanup
     */
    stopCleanup(): void;
    /**
     * Get all sessions (for testing/debugging)
     */
    getSessions(): Map<string, Session>;
    /**
     * Create a new session with a unique ID
     */
    createSession(): Session;
    /**
     * Get a session by ID, returns undefined if not found
     */
    getSession(id: string): Session | undefined;
    /**
     * Update session's last active timestamp
     */
    touchSession(id: string): boolean;
    /**
     * Update session state
     */
    updateSessionState(id: string, state: ServerState): boolean;
    /**
     * Store client info on the session after initialization
     */
    setClientInfo(id: string, clientInfo: {
        name: string;
        version: string;
    }, clientCapabilities?: ClientCapabilities): boolean;
    /**
     * Destroy a session by ID
     */
    destroySession(id: string): boolean;
    /**
     * Clean up expired sessions based on TTL
     */
    cleanup(): number;
    /**
     * Get number of active sessions
     */
    get size(): number;
    /**
     * Clear all sessions
     */
    clear(): void;
}
//# sourceMappingURL=session.d.ts.map