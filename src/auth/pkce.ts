/**
 * PKCE (Proof Key for Code Exchange) implementation
 * Per OAuth 2.1 Section 4.1.1 and RFC 7636
 */

import { randomBytes, createHash } from 'node:crypto';

/**
 * Constants per OAuth 2.1 specification
 */
export const PKCE_VERIFIER_MIN_LENGTH = 43;
export const PKCE_VERIFIER_MAX_LENGTH = 128;
export const PKCE_VERIFIER_DEFAULT_LENGTH = 64;
export const PKCE_VERIFIER_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Supported code challenge methods
 * Note: 'plain' is NOT supported per MCP spec - only S256
 */
export type CodeChallengeMethod = 'S256' | 'plain';

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * BASE64URL encoding per RFC 4648 Section 5
 * No padding characters
 */
export function base64UrlEncode(buffer: Buffer | Uint8Array): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Validates that a code verifier meets OAuth 2.1 requirements:
 * - Length: 43-128 characters
 * - Characters: [A-Z] [a-z] [0-9] - . _ ~ (unreserved URI characters)
 */
export function isValidCodeVerifier(verifier: string): boolean {
  if (typeof verifier !== 'string') {
    return false;
  }

  if (
    verifier.length < PKCE_VERIFIER_MIN_LENGTH ||
    verifier.length > PKCE_VERIFIER_MAX_LENGTH
  ) {
    return false;
  }

  // Check all characters are in the allowed charset
  const charsetRegex = /^[A-Za-z0-9\-._~]+$/;
  return charsetRegex.test(verifier);
}

/**
 * Generates a cryptographically random code verifier
 * Per OAuth 2.1 Section 4.1.1
 *
 * @param length - Length of the verifier (43-128, default 64)
 * @returns Cryptographically random code verifier string
 * @throws Error if length is outside valid range
 */
export function generateCodeVerifier(length: number = PKCE_VERIFIER_DEFAULT_LENGTH): string {
  if (length < PKCE_VERIFIER_MIN_LENGTH || length > PKCE_VERIFIER_MAX_LENGTH) {
    throw new Error(
      `Code verifier length must be between ${PKCE_VERIFIER_MIN_LENGTH} and ${PKCE_VERIFIER_MAX_LENGTH}, got ${length}`
    );
  }

  const charsetLength = PKCE_VERIFIER_CHARSET.length;
  const randomBytesBuffer = randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    // Use modulo to map random byte to charset index
    const randomByte = randomBytesBuffer[i]!;
    const randomIndex = randomByte % charsetLength;
    result += PKCE_VERIFIER_CHARSET[randomIndex]!;
  }

  return result;
}

/**
 * Generates a code challenge from a code verifier using S256 method
 * Algorithm: BASE64URL(SHA256(code_verifier))
 *
 * @param verifier - The code verifier string
 * @returns BASE64URL-encoded SHA-256 hash of the verifier (no padding)
 * @throws Error if verifier is invalid
 */
export function generateCodeChallenge(verifier: string): string {
  if (!isValidCodeVerifier(verifier)) {
    throw new Error('Invalid code verifier');
  }

  const hash = createHash('sha256').update(verifier, 'ascii').digest();
  return base64UrlEncode(hash);
}

/**
 * Async version of generateCodeChallenge for API consistency
 * (computation is actually synchronous but wrapped for interface compatibility)
 */
export async function generateCodeChallengeAsync(verifier: string): Promise<string> {
  return generateCodeChallenge(verifier);
}

/**
 * Generates a complete PKCE challenge pair
 *
 * @param length - Optional length for the code verifier (43-128, default 64)
 * @returns Object containing code verifier, challenge, and method
 */
export function generatePKCEChallenge(length?: number): PKCEChallenge {
  const codeVerifier = generateCodeVerifier(length);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * Verifies a code verifier against a code challenge
 * Per MCP spec, only S256 method is supported
 *
 * @param verifier - The code verifier to verify
 * @param challenge - The code challenge to verify against
 * @param method - The challenge method (only 'S256' is supported)
 * @returns true if verification succeeds, false otherwise
 * @throws Error if 'plain' method is requested (not supported per MCP spec)
 */
export async function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: CodeChallengeMethod = 'S256'
): Promise<boolean> {
  if (method === 'plain') {
    throw new Error("'plain' code challenge method is not supported per MCP specification");
  }

  if (method !== 'S256') {
    throw new Error(`Unsupported code challenge method: ${method}`);
  }

  if (!isValidCodeVerifier(verifier)) {
    return false;
  }

  try {
    const expectedChallenge = generateCodeChallenge(verifier);
    // Use timing-safe comparison to prevent timing attacks
    return timingSafeEqual(expectedChallenge, challenge);
  } catch {
    return false;
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  // Node.js crypto.timingSafeEqual requires same length buffers
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i]! ^ bufB[i]!;
  }

  return result === 0;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use verifyCodeChallenge instead
 */
export function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
  if (!isValidCodeVerifier(codeVerifier)) {
    return false;
  }

  try {
    const expectedChallenge = generateCodeChallenge(codeVerifier);
    return timingSafeEqual(expectedChallenge, codeChallenge);
  } catch {
    return false;
  }
}
