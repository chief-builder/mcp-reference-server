/**
 * OAuth 2.1 Flow E2E Tests
 *
 * Tests the complete OAuth authorization code flow with PKCE,
 * including token refresh and API authentication.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ServerHarness } from './helpers/server-harness.js';
import { getEphemeralPort } from './helpers/assertions.js';
import { generateCodeVerifier, generateCodeChallenge } from '../../src/auth/pkce.js';
import { randomBytes } from 'node:crypto';

describe('OAuth 2.1 Flow E2E', () => {
  let harness: ServerHarness;
  let baseUrl: string;
  let port: number;

  beforeAll(async () => {
    port = getEphemeralPort();
    harness = new ServerHarness({
      port,
      transport: 'http',
      env: {
        OAUTH_SERVER_ENABLED: 'true',
        AUTH_ENABLED: 'true',
        MCP_ALLOWED_ORIGINS: '*',
        OAUTH_ACCESS_TOKEN_TTL: '3600',
        OAUTH_REFRESH_TOKEN_TTL: '86400',
      },
    });
    await harness.start();
    baseUrl = harness.getUrl();
  });

  afterAll(async () => {
    await harness.stop();
  });

  describe('Authorization Endpoint', () => {
    it('should redirect with code for valid authorization request', async () => {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = randomBytes(32).toString('base64url');

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const response = await fetch(`${baseUrl}/oauth/authorize?${params}`, {
        method: 'GET',
        redirect: 'manual',
      });

      expect(response.status).toBe(302);

      const location = response.headers.get('location');
      expect(location).toBeDefined();

      const callbackUrl = new URL(location!);
      expect(callbackUrl.origin + callbackUrl.pathname).toBe('http://localhost:5173/callback');
      expect(callbackUrl.searchParams.get('code')).toBeDefined();
      expect(callbackUrl.searchParams.get('state')).toBe(state);
    });

    it('should reject request without PKCE', async () => {
      const state = randomBytes(32).toString('base64url');

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
      });

      const response = await fetch(`${baseUrl}/oauth/authorize?${params}`, {
        method: 'GET',
        redirect: 'manual',
      });

      expect(response.status).toBe(302);

      const location = response.headers.get('location');
      const callbackUrl = new URL(location!);
      expect(callbackUrl.searchParams.get('error')).toBe('invalid_request');
      expect(callbackUrl.searchParams.get('error_description')).toContain('code_challenge');
    });

    it('should reject plain PKCE method', async () => {
      const state = randomBytes(32).toString('base64url');

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
        code_challenge: 'some-challenge',
        code_challenge_method: 'plain',
      });

      const response = await fetch(`${baseUrl}/oauth/authorize?${params}`, {
        method: 'GET',
        redirect: 'manual',
      });

      expect(response.status).toBe(302);

      const location = response.headers.get('location');
      const callbackUrl = new URL(location!);
      expect(callbackUrl.searchParams.get('error')).toBe('invalid_request');
      expect(callbackUrl.searchParams.get('error_description')).toContain('S256');
    });
  });

  describe('Token Endpoint', () => {
    it('should exchange authorization code for tokens', async () => {
      // Step 1: Get authorization code
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = randomBytes(32).toString('base64url');

      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authResponse = await fetch(`${baseUrl}/oauth/authorize?${authParams}`, {
        method: 'GET',
        redirect: 'manual',
      });

      const location = authResponse.headers.get('location');
      const callbackUrl = new URL(location!);
      const code = callbackUrl.searchParams.get('code')!;

      // Step 2: Exchange code for tokens
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:5173/callback',
        client_id: 'mcp-ui-client',
        code_verifier: codeVerifier,
      });

      const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });

      expect(tokenResponse.status).toBe(200);

      const tokens = await tokenResponse.json() as {
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token: string;
        scope: string;
      };

      expect(tokens.access_token).toBeDefined();
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.expires_in).toBe(3600);
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.scope).toBe('openid profile');
    });

    it('should reject invalid PKCE verifier', async () => {
      // Step 1: Get authorization code with one verifier
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = randomBytes(32).toString('base64url');

      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authResponse = await fetch(`${baseUrl}/oauth/authorize?${authParams}`, {
        method: 'GET',
        redirect: 'manual',
      });

      const location = authResponse.headers.get('location');
      const callbackUrl = new URL(location!);
      const code = callbackUrl.searchParams.get('code')!;

      // Step 2: Try to exchange with a different verifier
      const wrongVerifier = generateCodeVerifier();

      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:5173/callback',
        client_id: 'mcp-ui-client',
        code_verifier: wrongVerifier,
      });

      const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });

      expect(tokenResponse.status).toBe(400);

      const error = await tokenResponse.json() as { error: string };
      expect(error.error).toBe('invalid_grant');
    });

    it('should reject code reuse', async () => {
      // Get authorization code
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = randomBytes(32).toString('base64url');

      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authResponse = await fetch(`${baseUrl}/oauth/authorize?${authParams}`, {
        method: 'GET',
        redirect: 'manual',
      });

      const location = authResponse.headers.get('location');
      const callbackUrl = new URL(location!);
      const code = callbackUrl.searchParams.get('code')!;

      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:5173/callback',
        client_id: 'mcp-ui-client',
        code_verifier: codeVerifier,
      });

      // First exchange should succeed
      const response1 = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });
      expect(response1.status).toBe(200);

      // Second exchange should fail
      const response2 = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });
      expect(response2.status).toBe(400);
      const error = await response2.json() as { error: string };
      expect(error.error).toBe('invalid_grant');
    });
  });

  describe('Token Refresh', () => {
    it('should refresh tokens using refresh_token grant', async () => {
      // Get initial tokens
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = randomBytes(32).toString('base64url');

      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authResponse = await fetch(`${baseUrl}/oauth/authorize?${authParams}`, {
        method: 'GET',
        redirect: 'manual',
      });

      const location = authResponse.headers.get('location');
      const callbackUrl = new URL(location!);
      const code = callbackUrl.searchParams.get('code')!;

      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:5173/callback',
        client_id: 'mcp-ui-client',
        code_verifier: codeVerifier,
      });

      const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      const initialTokens = await tokenResponse.json() as {
        access_token: string;
        refresh_token: string;
      };

      // Refresh the token
      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: initialTokens.refresh_token,
        client_id: 'mcp-ui-client',
      });

      const refreshResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams.toString(),
      });

      expect(refreshResponse.status).toBe(200);

      const newTokens = await refreshResponse.json() as {
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
      };

      expect(newTokens.access_token).toBeDefined();
      expect(newTokens.access_token).not.toBe(initialTokens.access_token);
      expect(newTokens.refresh_token).toBeDefined();
      expect(newTokens.refresh_token).not.toBe(initialTokens.refresh_token);
      expect(newTokens.token_type).toBe('Bearer');
    });

    it('should invalidate old refresh token after rotation', async () => {
      // Get initial tokens
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = randomBytes(32).toString('base64url');

      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authResponse = await fetch(`${baseUrl}/oauth/authorize?${authParams}`, {
        method: 'GET',
        redirect: 'manual',
      });

      const location = authResponse.headers.get('location');
      const callbackUrl = new URL(location!);
      const code = callbackUrl.searchParams.get('code')!;

      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:5173/callback',
        client_id: 'mcp-ui-client',
        code_verifier: codeVerifier,
      });

      const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      const initialTokens = await tokenResponse.json() as { refresh_token: string };

      // Use refresh token once
      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: initialTokens.refresh_token,
        client_id: 'mcp-ui-client',
      });

      await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams.toString(),
      });

      // Try to use the old refresh token again
      const retryResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams.toString(),
      });

      expect(retryResponse.status).toBe(400);
      const error = await retryResponse.json() as { error: string };
      expect(error.error).toBe('invalid_grant');
    });
  });

  describe('Protected API Access', () => {
    it('should allow access to /api/chat with valid token', async () => {
      // Get tokens
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = randomBytes(32).toString('base64url');

      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authResponse = await fetch(`${baseUrl}/oauth/authorize?${authParams}`, {
        method: 'GET',
        redirect: 'manual',
      });

      const location = authResponse.headers.get('location');
      const callbackUrl = new URL(location!);
      const code = callbackUrl.searchParams.get('code')!;

      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:5173/callback',
        client_id: 'mcp-ui-client',
        code_verifier: codeVerifier,
      });

      const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      const tokens = await tokenResponse.json() as { access_token: string };

      // Use token to access protected endpoint
      const chatResponse = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      // Should not be 401 - might be other error due to missing LLM config
      // but auth should pass
      expect(chatResponse.status).not.toBe(401);
    });

    it('should reject access without token when AUTH_ENABLED=true', async () => {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should reject access with invalid token', async () => {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-token',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Complete Flow', () => {
    it('should complete full OAuth flow: authorize -> token -> api -> refresh', async () => {
      // 1. Authorization
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = randomBytes(32).toString('base64url');

      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: 'mcp-ui-client',
        redirect_uri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const authResponse = await fetch(`${baseUrl}/oauth/authorize?${authParams}`, {
        method: 'GET',
        redirect: 'manual',
      });

      expect(authResponse.status).toBe(302);
      const location = authResponse.headers.get('location');
      const callbackUrl = new URL(location!);
      const code = callbackUrl.searchParams.get('code')!;
      expect(callbackUrl.searchParams.get('state')).toBe(state);

      // 2. Token exchange
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:5173/callback',
        client_id: 'mcp-ui-client',
        code_verifier: codeVerifier,
      });

      const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      expect(tokenResponse.status).toBe(200);
      const tokens = await tokenResponse.json() as {
        access_token: string;
        refresh_token: string;
      };

      // 3. Use access token for API
      const apiResponse = await fetch(`${baseUrl}/api/health`, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      });

      expect(apiResponse.status).toBe(200);

      // 4. Refresh token
      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'mcp-ui-client',
      });

      const refreshResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams.toString(),
      });

      expect(refreshResponse.status).toBe(200);
      const newTokens = await refreshResponse.json() as {
        access_token: string;
        refresh_token: string;
      };

      // 5. Use new access token
      const apiResponse2 = await fetch(`${baseUrl}/api/health`, {
        headers: {
          'Authorization': `Bearer ${newTokens.access_token}`,
        },
      });

      expect(apiResponse2.status).toBe(200);
    });
  });
});
