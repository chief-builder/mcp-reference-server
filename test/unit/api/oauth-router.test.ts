import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuthStore } from '../../../src/api/oauth-store.js';
import { JwtIssuer } from '../../../src/api/jwt-issuer.js';
import { generateCodeVerifier, generateCodeChallenge } from '../../../src/auth/pkce.js';

/**
 * Unit tests for OAuth server components.
 *
 * Note: HTTP-level tests are in test/e2e/oauth-flow.e2e.ts
 * These tests focus on the underlying store and JWT issuer logic.
 */
describe('OAuth Server Components', () => {
  let store: OAuthStore;
  let jwtIssuer: JwtIssuer;

  beforeEach(() => {
    store = new OAuthStore({ cleanupIntervalMs: 0 });
    jwtIssuer = new JwtIssuer({
      issuer: 'http://localhost:3000',
      signingSecret: 'test-secret-for-testing-only-32bytes!',
    });
  });

  afterEach(() => {
    store.stopCleanup();
    store.clear();
  });

  describe('Authorization Code Flow', () => {
    it('should store and retrieve authorization code with PKCE', () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const code = store.storeAuthorizationCode({
        clientId: 'mcp-ui-client',
        redirectUri: 'http://localhost:5173/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
        subject: 'test-user',
        scope: 'openid profile',
        state: 'test-state',
      });

      const entry = store.consumeAuthorizationCode(code);
      expect(entry).toBeDefined();
      expect(entry?.clientId).toBe('mcp-ui-client');
      expect(entry?.codeChallenge).toBe(codeChallenge);
      expect(entry?.codeChallengeMethod).toBe('S256');
      expect(entry?.subject).toBe('test-user');
      expect(entry?.scope).toBe('openid profile');
    });

    it('should enforce single-use codes', () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const code = store.storeAuthorizationCode({
        clientId: 'mcp-ui-client',
        redirectUri: 'http://localhost:5173/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
        subject: 'test-user',
        scope: 'openid profile',
        state: 'test-state',
      });

      // First consumption should succeed
      const entry1 = store.consumeAuthorizationCode(code);
      expect(entry1).toBeDefined();

      // Second consumption should fail
      const entry2 = store.consumeAuthorizationCode(code);
      expect(entry2).toBeUndefined();
    });

    it('should expire authorization codes', () => {
      vi.useFakeTimers();

      const shortTtlStore = new OAuthStore({
        codeTtlSeconds: 1,
        cleanupIntervalMs: 0,
      });

      const code = shortTtlStore.storeAuthorizationCode({
        clientId: 'mcp-ui-client',
        redirectUri: 'http://localhost:5173/callback',
        codeChallenge: 'test-challenge',
        codeChallengeMethod: 'S256',
        subject: 'test-user',
        scope: 'openid profile',
        state: 'test-state',
      });

      // Advance time past expiration
      vi.advanceTimersByTime(2000);

      const entry = shortTtlStore.consumeAuthorizationCode(code);
      expect(entry).toBeUndefined();

      vi.useRealTimers();
      shortTtlStore.stopCleanup();
    });
  });

  describe('Token Generation', () => {
    it('should issue valid access tokens', async () => {
      const token = await jwtIssuer.issueAccessToken(
        {
          sub: 'test-user',
          aud: 'mcp-ui-client',
          scope: 'openid profile',
        },
        3600
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Token should be a valid JWT (3 parts)
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include correct claims in access token', async () => {
      const token = await jwtIssuer.issueAccessToken(
        {
          sub: 'user-123',
          aud: 'client-abc',
          scope: 'read write',
        },
        3600
      );

      // Decode the payload
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64url').toString()
      ) as {
        iss: string;
        sub: string;
        aud: string;
        scope: string;
        exp: number;
        iat: number;
      };

      expect(payload.iss).toBe('http://localhost:3000');
      expect(payload.sub).toBe('user-123');
      expect(payload.aud).toBe('client-abc');
      expect(payload.scope).toBe('read write');
      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
      expect(payload.exp - payload.iat).toBe(3600);
    });

    it('should verify access tokens', async () => {
      const token = await jwtIssuer.issueAccessToken(
        {
          sub: 'test-user',
          aud: 'mcp-ui-client',
          scope: 'openid profile',
        },
        3600
      );

      const payload = await jwtIssuer.verifyAccessToken(token, 'mcp-ui-client');
      expect(payload.sub).toBe('test-user');
    });

    it('should reject tokens with wrong audience', async () => {
      const token = await jwtIssuer.issueAccessToken(
        {
          sub: 'test-user',
          aud: 'mcp-ui-client',
          scope: 'openid profile',
        },
        3600
      );

      await expect(
        jwtIssuer.verifyAccessToken(token, 'wrong-client')
      ).rejects.toThrow();
    });
  });

  describe('Refresh Token Flow', () => {
    it('should store and retrieve refresh tokens', () => {
      const token = store.storeRefreshToken(
        {
          clientId: 'mcp-ui-client',
          subject: 'test-user',
          scope: 'openid profile',
        },
        86400
      );

      const entry = store.getRefreshToken(token);
      expect(entry).toBeDefined();
      expect(entry?.clientId).toBe('mcp-ui-client');
      expect(entry?.subject).toBe('test-user');
      expect(entry?.scope).toBe('openid profile');
    });

    it('should allow multiple reads of refresh token', () => {
      const token = store.storeRefreshToken(
        {
          clientId: 'mcp-ui-client',
          subject: 'test-user',
          scope: 'openid profile',
        },
        86400
      );

      const entry1 = store.getRefreshToken(token);
      const entry2 = store.getRefreshToken(token);
      expect(entry1).toBeDefined();
      expect(entry2).toBeDefined();
    });

    it('should revoke refresh tokens', () => {
      const token = store.storeRefreshToken(
        {
          clientId: 'mcp-ui-client',
          subject: 'test-user',
          scope: 'openid profile',
        },
        86400
      );

      const revoked = store.revokeRefreshToken(token);
      expect(revoked).toBe(true);

      const entry = store.getRefreshToken(token);
      expect(entry).toBeUndefined();
    });

    it('should expire refresh tokens', () => {
      vi.useFakeTimers();

      const token = store.storeRefreshToken(
        {
          clientId: 'mcp-ui-client',
          subject: 'test-user',
          scope: 'openid profile',
        },
        1 // 1 second TTL
      );

      vi.advanceTimersByTime(2000);

      const entry = store.getRefreshToken(token);
      expect(entry).toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe('JWT Refresh Token', () => {
    it('should issue refresh tokens as JWTs', async () => {
      const token = await jwtIssuer.issueRefreshToken('test-user', 86400);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Token should be a valid JWT (3 parts)
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should verify refresh tokens', async () => {
      const token = await jwtIssuer.issueRefreshToken('test-user', 86400);
      const payload = await jwtIssuer.verifyRefreshToken(token);

      expect(payload.sub).toBe('test-user');
      expect(payload.type).toBe('refresh');
      expect(payload.jti).toBeDefined();
    });

    it('should reject non-refresh tokens as refresh tokens', async () => {
      const accessToken = await jwtIssuer.issueAccessToken(
        {
          sub: 'test-user',
          aud: 'mcp-ui-client',
          scope: 'openid profile',
        },
        3600
      );

      await expect(
        jwtIssuer.verifyRefreshToken(accessToken)
      ).rejects.toThrow('Token is not a refresh token');
    });
  });

  describe('Token Expiration', () => {
    it('should reject expired access tokens', async () => {
      vi.useFakeTimers();

      const token = await jwtIssuer.issueAccessToken(
        {
          sub: 'test-user',
          aud: 'mcp-ui-client',
          scope: 'openid profile',
        },
        1 // 1 second
      );

      // Advance time past expiration
      vi.advanceTimersByTime(2000);

      await expect(
        jwtIssuer.verifyAccessToken(token)
      ).rejects.toThrow();

      vi.useRealTimers();
    });
  });

  describe('PKCE Integration', () => {
    it('should work with PKCE verification in token exchange', async () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Store authorization code with PKCE
      const code = store.storeAuthorizationCode({
        clientId: 'mcp-ui-client',
        redirectUri: 'http://localhost:5173/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
        subject: 'test-user',
        scope: 'openid profile',
        state: 'test-state',
      });

      // Consume the code
      const entry = store.consumeAuthorizationCode(code);
      expect(entry).toBeDefined();

      // Verify PKCE
      const { verifyCodeChallenge } = await import('../../../src/auth/pkce.js');
      const isValid = await verifyCodeChallenge(
        codeVerifier,
        entry!.codeChallenge,
        entry!.codeChallengeMethod
      );
      expect(isValid).toBe(true);

      // If valid, issue tokens
      const accessToken = await jwtIssuer.issueAccessToken(
        {
          sub: entry!.subject,
          aud: entry!.clientId,
          scope: entry!.scope,
        },
        3600
      );

      expect(accessToken).toBeDefined();
    });

    it('should reject invalid PKCE verifier', async () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Store authorization code
      const code = store.storeAuthorizationCode({
        clientId: 'mcp-ui-client',
        redirectUri: 'http://localhost:5173/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
        subject: 'test-user',
        scope: 'openid profile',
        state: 'test-state',
      });

      // Consume the code
      const entry = store.consumeAuthorizationCode(code);
      expect(entry).toBeDefined();

      // Try with wrong verifier
      const wrongVerifier = generateCodeVerifier(); // Different verifier
      const { verifyCodeChallenge } = await import('../../../src/auth/pkce.js');
      const isValid = await verifyCodeChallenge(
        wrongVerifier,
        entry!.codeChallenge,
        entry!.codeChallengeMethod
      );
      expect(isValid).toBe(false);
    });
  });
});
