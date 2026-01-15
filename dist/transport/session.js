/**
 * Session management for HTTP transport
 *
 * Implements session ID generation and lifecycle management for MCP sessions.
 * Session IDs are cryptographically secure using crypto.randomUUID.
 */
import { randomUUID } from 'node:crypto';
/**
 * Generates a cryptographically secure session ID.
 * Uses visible ASCII characters (0x21-0x7E) per MCP specification.
 */
export function generateSessionId() {
    // Use crypto.randomUUID which provides a cryptographically secure UUID v4
    // UUIDs contain only hex characters and hyphens, which are within visible ASCII range
    return randomUUID();
}
export class SessionManager {
    sessions = new Map();
    ttlMs;
    cleanupIntervalMs;
    cleanupTimer = null;
    constructor(options) {
        this.ttlMs = options?.ttlMs ?? 30 * 60 * 1000; // 30 minutes default
        this.cleanupIntervalMs = options?.cleanupIntervalMs ?? 5 * 60 * 1000; // 5 minutes default
    }
    /**
     * Start automatic cleanup of expired sessions
     */
    startCleanup() {
        if (this.cleanupTimer) {
            return;
        }
        this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    }
    /**
     * Stop automatic cleanup
     */
    stopCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
    /**
     * Get all sessions (for testing/debugging)
     */
    getSessions() {
        return this.sessions;
    }
    /**
     * Create a new session with a unique ID
     */
    createSession() {
        const id = generateSessionId();
        const now = new Date();
        const session = {
            id,
            createdAt: now,
            lastActiveAt: now,
            state: 'uninitialized',
        };
        this.sessions.set(id, session);
        return session;
    }
    /**
     * Get a session by ID, returns undefined if not found
     */
    getSession(id) {
        return this.sessions.get(id);
    }
    /**
     * Update session's last active timestamp
     */
    touchSession(id) {
        const session = this.sessions.get(id);
        if (!session) {
            return false;
        }
        session.lastActiveAt = new Date();
        return true;
    }
    /**
     * Update session state
     */
    updateSessionState(id, state) {
        const session = this.sessions.get(id);
        if (!session) {
            return false;
        }
        session.state = state;
        session.lastActiveAt = new Date();
        return true;
    }
    /**
     * Store client info on the session after initialization
     */
    setClientInfo(id, clientInfo, clientCapabilities) {
        const session = this.sessions.get(id);
        if (!session) {
            return false;
        }
        session.clientInfo = clientInfo;
        if (clientCapabilities !== undefined) {
            session.clientCapabilities = clientCapabilities;
        }
        session.lastActiveAt = new Date();
        return true;
    }
    /**
     * Destroy a session by ID
     */
    destroySession(id) {
        return this.sessions.delete(id);
    }
    /**
     * Clean up expired sessions based on TTL
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [id, session] of this.sessions) {
            const age = now - session.lastActiveAt.getTime();
            if (age > this.ttlMs) {
                this.sessions.delete(id);
                cleaned++;
            }
        }
        return cleaned;
    }
    /**
     * Get number of active sessions
     */
    get size() {
        return this.sessions.size;
    }
    /**
     * Clear all sessions
     */
    clear() {
        this.sessions.clear();
    }
}
//# sourceMappingURL=session.js.map