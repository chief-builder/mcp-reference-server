/**
 * In-memory OAuth Store for Development Server
 *
 * Stores authorization codes and refresh tokens for the OAuth 2.1 flow.
 * This is for development/testing only - not suitable for production.
 */

import { randomBytes } from 'node:crypto';

// =============================================================================
// Types
// =============================================================================

export interface AuthorizationCode {
  /** The authorization code string */
  code: string;
  /** Client ID that requested the authorization */
  clientId: string;
  /** Redirect URI used in the authorization request */
  redirectUri: string;
  /** PKCE code challenge */
  codeChallenge: string;
  /** PKCE code challenge method (always S256) */
  codeChallengeMethod: 'S256';
  /** User subject (who authorized) */
  subject: string;
  /** Granted scopes */
  scope: string;
  /** State parameter from the request */
  state: string;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Expiration timestamp (ms) - codes expire quickly (10 minutes max) */
  expiresAt: number;
}

export interface RefreshTokenEntry {
  /** The refresh token string */
  token: string;
  /** Client ID the token was issued to */
  clientId: string;
  /** User subject */
  subject: string;
  /** Granted scopes */
  scope: string;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Expiration timestamp (ms) */
  expiresAt: number;
}

export interface OAuthStoreOptions {
  /** Authorization code TTL in seconds (default: 600 = 10 minutes) */
  codeTtlSeconds?: number;
  /** Cleanup interval in milliseconds (default: 60000 = 1 minute) */
  cleanupIntervalMs?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CODE_TTL_SECONDS = 600; // 10 minutes
const DEFAULT_CLEANUP_INTERVAL_MS = 60000; // 1 minute
const CODE_LENGTH_BYTES = 32; // 256 bits of entropy
const REFRESH_TOKEN_LENGTH_BYTES = 32;

// =============================================================================
// OAuth Store Class
// =============================================================================

export class OAuthStore {
  private readonly codes: Map<string, AuthorizationCode> = new Map();
  private readonly refreshTokens: Map<string, RefreshTokenEntry> = new Map();
  private readonly codeTtlSeconds: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: OAuthStoreOptions = {}) {
    this.codeTtlSeconds = options.codeTtlSeconds ?? DEFAULT_CODE_TTL_SECONDS;

    // Start periodic cleanup
    const cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    if (cleanupIntervalMs > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
      // Don't block process exit
      this.cleanupInterval.unref();
    }
  }

  /**
   * Generate a new authorization code
   */
  generateCode(): string {
    return randomBytes(CODE_LENGTH_BYTES).toString('base64url');
  }

  /**
   * Generate a new refresh token
   */
  generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_LENGTH_BYTES).toString('base64url');
  }

  /**
   * Store an authorization code
   *
   * @param entry - The authorization code entry (without code and timestamps)
   * @returns The generated authorization code
   */
  storeAuthorizationCode(
    entry: Omit<AuthorizationCode, 'code' | 'createdAt' | 'expiresAt'>
  ): string {
    const code = this.generateCode();
    const now = Date.now();

    const fullEntry: AuthorizationCode = {
      ...entry,
      code,
      createdAt: now,
      expiresAt: now + this.codeTtlSeconds * 1000,
    };

    this.codes.set(code, fullEntry);
    return code;
  }

  /**
   * Consume an authorization code (single-use)
   *
   * @param code - The authorization code to consume
   * @returns The code entry if valid and not expired, undefined otherwise
   */
  consumeAuthorizationCode(code: string): AuthorizationCode | undefined {
    const entry = this.codes.get(code);
    if (!entry) {
      return undefined;
    }

    // Always delete - codes are single-use
    this.codes.delete(code);

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      return undefined;
    }

    return entry;
  }

  /**
   * Store a refresh token
   *
   * @param entry - The refresh token entry (without token and timestamps)
   * @param expiresInSeconds - Token lifetime in seconds
   * @returns The generated refresh token
   */
  storeRefreshToken(
    entry: Omit<RefreshTokenEntry, 'token' | 'createdAt' | 'expiresAt'>,
    expiresInSeconds: number
  ): string {
    const token = this.generateRefreshToken();
    const now = Date.now();

    const fullEntry: RefreshTokenEntry = {
      ...entry,
      token,
      createdAt: now,
      expiresAt: now + expiresInSeconds * 1000,
    };

    this.refreshTokens.set(token, fullEntry);
    return token;
  }

  /**
   * Get a refresh token entry
   *
   * @param token - The refresh token
   * @returns The token entry if valid and not expired, undefined otherwise
   */
  getRefreshToken(token: string): RefreshTokenEntry | undefined {
    const entry = this.refreshTokens.get(token);
    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.refreshTokens.delete(token);
      return undefined;
    }

    return entry;
  }

  /**
   * Revoke a refresh token
   *
   * @param token - The refresh token to revoke
   * @returns true if the token was found and revoked, false otherwise
   */
  revokeRefreshToken(token: string): boolean {
    return this.refreshTokens.delete(token);
  }

  /**
   * Remove all expired entries
   */
  cleanup(): void {
    const now = Date.now();

    // Clean up expired authorization codes
    for (const [code, entry] of this.codes) {
      if (now > entry.expiresAt) {
        this.codes.delete(code);
      }
    }

    // Clean up expired refresh tokens
    for (const [token, entry] of this.refreshTokens) {
      if (now > entry.expiresAt) {
        this.refreshTokens.delete(token);
      }
    }
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all stored data (useful for testing)
   */
  clear(): void {
    this.codes.clear();
    this.refreshTokens.clear();
  }

  /**
   * Get stats for debugging
   */
  getStats(): { codes: number; refreshTokens: number } {
    return {
      codes: this.codes.size,
      refreshTokens: this.refreshTokens.size,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultStore: OAuthStore | null = null;

/**
 * Get the default OAuth store instance
 */
export function getOAuthStore(): OAuthStore {
  if (!defaultStore) {
    defaultStore = new OAuthStore();
  }
  return defaultStore;
}

/**
 * Reset the default store (useful for testing)
 */
export function resetOAuthStore(): void {
  if (defaultStore) {
    defaultStore.stopCleanup();
    defaultStore.clear();
    defaultStore = null;
  }
}
