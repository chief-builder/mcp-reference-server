/**
 * Session management for HTTP transport
 *
 * Implements session ID generation and lifecycle management for MCP sessions.
 * Session IDs are cryptographically secure using crypto.randomUUID.
 */

import { randomUUID } from 'node:crypto';
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
export function generateSessionId(): string {
  // Use crypto.randomUUID which provides a cryptographically secure UUID v4
  // UUIDs contain only hex characters and hyphens, which are within visible ASCII range
  return randomUUID();
}

export class SessionManager {
  private readonly sessions: Map<string, Session> = new Map();
  private readonly ttlMs: number;
  private readonly cleanupIntervalMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: SessionManagerOptions) {
    this.ttlMs = options?.ttlMs ?? 30 * 60 * 1000; // 30 minutes default
    this.cleanupIntervalMs = options?.cleanupIntervalMs ?? 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Start automatic cleanup of expired sessions
   */
  startCleanup(): void {
    if (this.cleanupTimer) {
      return;
    }
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get all sessions (for testing/debugging)
   */
  getSessions(): Map<string, Session> {
    return this.sessions;
  }

  /**
   * Create a new session with a unique ID
   */
  createSession(): Session {
    const id = generateSessionId();
    const now = new Date();
    const session: Session = {
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
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Update session's last active timestamp
   */
  touchSession(id: string): boolean {
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
  updateSessionState(id: string, state: ServerState): boolean {
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
  setClientInfo(
    id: string,
    clientInfo: { name: string; version: string },
    clientCapabilities?: ClientCapabilities
  ): boolean {
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
  destroySession(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * Clean up expired sessions based on TTL
   */
  cleanup(): number {
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
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
  }
}
