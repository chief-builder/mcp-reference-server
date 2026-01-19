import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OAuthStore,
  getOAuthStore,
  resetOAuthStore,
} from '../../../src/api/oauth-store.js';

describe('OAuthStore', () => {
  let store: OAuthStore;

  beforeEach(() => {
    // Use 0 cleanup interval to prevent background timers
    store = new OAuthStore({ cleanupIntervalMs: 0 });
  });

  afterEach(() => {
    store.stopCleanup();
    store.clear();
  });

  describe('generateCode', () => {
    it('should generate a base64url encoded string', () => {
      const code = store.generateCode();
      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      // Base64url characters only
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate unique codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(store.generateCode());
      }
      expect(codes.size).toBe(100);
    });

    it('should generate codes with sufficient length', () => {
      // 32 bytes = ~43 chars in base64url
      const code = store.generateCode();
      expect(code.length).toBeGreaterThanOrEqual(40);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a base64url encoded string', () => {
      const token = store.generateRefreshToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(store.generateRefreshToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('storeAuthorizationCode', () => {
    it('should store and return a code', () => {
      const code = store.storeAuthorizationCode({
        clientId: 'test-client',
        redirectUri: 'http://localhost:5173/callback',
        codeChallenge: 'test-challenge',
        codeChallengeMethod: 'S256',
        subject: 'user-123',
        scope: 'openid profile',
        state: 'random-state',
      });

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
    });

    it('should store code with correct properties', () => {
      const code = store.storeAuthorizationCode({
        clientId: 'test-client',
        redirectUri: 'http://localhost:5173/callback',
        codeChallenge: 'challenge-123',
        codeChallengeMethod: 'S256',
        subject: 'user-456',
        scope: 'openid',
        state: 'state-abc',
      });

      const entry = store.consumeAuthorizationCode(code);
      expect(entry).toBeDefined();
      expect(entry?.clientId).toBe('test-client');
      expect(entry?.redirectUri).toBe('http://localhost:5173/callback');
      expect(entry?.codeChallenge).toBe('challenge-123');
      expect(entry?.codeChallengeMethod).toBe('S256');
      expect(entry?.subject).toBe('user-456');
      expect(entry?.scope).toBe('openid');
      expect(entry?.state).toBe('state-abc');
    });
  });

  describe('consumeAuthorizationCode', () => {
    it('should return the code entry on first call', () => {
      const code = store.storeAuthorizationCode({
        clientId: 'test-client',
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        subject: 'user',
        scope: 'openid',
        state: 'state',
      });

      const entry = store.consumeAuthorizationCode(code);
      expect(entry).toBeDefined();
      expect(entry?.code).toBe(code);
    });

    it('should return undefined on second call (single-use)', () => {
      const code = store.storeAuthorizationCode({
        clientId: 'test-client',
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        subject: 'user',
        scope: 'openid',
        state: 'state',
      });

      // First call - should succeed
      const entry1 = store.consumeAuthorizationCode(code);
      expect(entry1).toBeDefined();

      // Second call - should fail (code consumed)
      const entry2 = store.consumeAuthorizationCode(code);
      expect(entry2).toBeUndefined();
    });

    it('should return undefined for non-existent code', () => {
      const entry = store.consumeAuthorizationCode('non-existent-code');
      expect(entry).toBeUndefined();
    });

    it('should return undefined for expired code', () => {
      // Create store with very short TTL
      const shortTtlStore = new OAuthStore({
        codeTtlSeconds: 1,
        cleanupIntervalMs: 0,
      });

      const code = shortTtlStore.storeAuthorizationCode({
        clientId: 'test-client',
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        subject: 'user',
        scope: 'openid',
        state: 'state',
      });

      // Mock time advancement
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000); // 2 seconds (past 1s TTL)

      const entry = shortTtlStore.consumeAuthorizationCode(code);
      expect(entry).toBeUndefined();

      vi.useRealTimers();
      shortTtlStore.stopCleanup();
    });
  });

  describe('storeRefreshToken', () => {
    it('should store and return a token', () => {
      const token = store.storeRefreshToken(
        {
          clientId: 'test-client',
          subject: 'user-123',
          scope: 'openid profile',
        },
        3600
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should store token with correct properties', () => {
      const token = store.storeRefreshToken(
        {
          clientId: 'my-client',
          subject: 'user-xyz',
          scope: 'read write',
        },
        7200
      );

      const entry = store.getRefreshToken(token);
      expect(entry).toBeDefined();
      expect(entry?.clientId).toBe('my-client');
      expect(entry?.subject).toBe('user-xyz');
      expect(entry?.scope).toBe('read write');
      expect(entry?.token).toBe(token);
    });
  });

  describe('getRefreshToken', () => {
    it('should return the token entry', () => {
      const token = store.storeRefreshToken(
        {
          clientId: 'test-client',
          subject: 'user',
          scope: 'openid',
        },
        3600
      );

      const entry = store.getRefreshToken(token);
      expect(entry).toBeDefined();
      expect(entry?.token).toBe(token);
    });

    it('should return undefined for non-existent token', () => {
      const entry = store.getRefreshToken('non-existent-token');
      expect(entry).toBeUndefined();
    });

    it('should return undefined for expired token', () => {
      vi.useFakeTimers();

      const token = store.storeRefreshToken(
        {
          clientId: 'test-client',
          subject: 'user',
          scope: 'openid',
        },
        1 // 1 second TTL
      );

      // Advance time past expiration
      vi.advanceTimersByTime(2000);

      const entry = store.getRefreshToken(token);
      expect(entry).toBeUndefined();

      vi.useRealTimers();
    });

    it('should allow multiple reads (not single-use)', () => {
      const token = store.storeRefreshToken(
        {
          clientId: 'test-client',
          subject: 'user',
          scope: 'openid',
        },
        3600
      );

      const entry1 = store.getRefreshToken(token);
      const entry2 = store.getRefreshToken(token);

      expect(entry1).toBeDefined();
      expect(entry2).toBeDefined();
      expect(entry1?.token).toBe(entry2?.token);
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke an existing token', () => {
      const token = store.storeRefreshToken(
        {
          clientId: 'test-client',
          subject: 'user',
          scope: 'openid',
        },
        3600
      );

      const revoked = store.revokeRefreshToken(token);
      expect(revoked).toBe(true);

      const entry = store.getRefreshToken(token);
      expect(entry).toBeUndefined();
    });

    it('should return false for non-existent token', () => {
      const revoked = store.revokeRefreshToken('non-existent-token');
      expect(revoked).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove expired authorization codes', () => {
      vi.useFakeTimers();

      const shortTtlStore = new OAuthStore({
        codeTtlSeconds: 1,
        cleanupIntervalMs: 0,
      });

      shortTtlStore.storeAuthorizationCode({
        clientId: 'test-client',
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        subject: 'user',
        scope: 'openid',
        state: 'state',
      });

      expect(shortTtlStore.getStats().codes).toBe(1);

      vi.advanceTimersByTime(2000);
      shortTtlStore.cleanup();

      expect(shortTtlStore.getStats().codes).toBe(0);

      vi.useRealTimers();
      shortTtlStore.stopCleanup();
    });

    it('should remove expired refresh tokens', () => {
      vi.useFakeTimers();

      store.storeRefreshToken(
        {
          clientId: 'test-client',
          subject: 'user',
          scope: 'openid',
        },
        1 // 1 second TTL
      );

      expect(store.getStats().refreshTokens).toBe(1);

      vi.advanceTimersByTime(2000);
      store.cleanup();

      expect(store.getStats().refreshTokens).toBe(0);

      vi.useRealTimers();
    });

    it('should not remove valid entries', () => {
      store.storeAuthorizationCode({
        clientId: 'test-client',
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        subject: 'user',
        scope: 'openid',
        state: 'state',
      });

      store.storeRefreshToken(
        {
          clientId: 'test-client',
          subject: 'user',
          scope: 'openid',
        },
        3600
      );

      store.cleanup();

      expect(store.getStats().codes).toBe(1);
      expect(store.getStats().refreshTokens).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      store.storeAuthorizationCode({
        clientId: 'test-client',
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        subject: 'user',
        scope: 'openid',
        state: 'state',
      });

      store.storeRefreshToken(
        {
          clientId: 'test-client',
          subject: 'user',
          scope: 'openid',
        },
        3600
      );

      expect(store.getStats().codes).toBe(1);
      expect(store.getStats().refreshTokens).toBe(1);

      store.clear();

      expect(store.getStats().codes).toBe(0);
      expect(store.getStats().refreshTokens).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct counts', () => {
      expect(store.getStats()).toEqual({ codes: 0, refreshTokens: 0 });

      store.storeAuthorizationCode({
        clientId: 'test-client',
        redirectUri: 'http://localhost/callback',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        subject: 'user',
        scope: 'openid',
        state: 'state',
      });

      expect(store.getStats()).toEqual({ codes: 1, refreshTokens: 0 });

      store.storeRefreshToken(
        {
          clientId: 'test-client',
          subject: 'user',
          scope: 'openid',
        },
        3600
      );

      expect(store.getStats()).toEqual({ codes: 1, refreshTokens: 1 });
    });
  });
});

describe('Singleton Functions', () => {
  afterEach(() => {
    resetOAuthStore();
  });

  describe('getOAuthStore', () => {
    it('should return the same instance on multiple calls', () => {
      const store1 = getOAuthStore();
      const store2 = getOAuthStore();
      expect(store1).toBe(store2);
    });
  });

  describe('resetOAuthStore', () => {
    it('should create a new instance after reset', () => {
      const store1 = getOAuthStore();
      store1.storeRefreshToken(
        {
          clientId: 'test',
          subject: 'user',
          scope: 'openid',
        },
        3600
      );

      resetOAuthStore();

      const store2 = getOAuthStore();
      expect(store2).not.toBe(store1);
      expect(store2.getStats().refreshTokens).toBe(0);
    });
  });
});
