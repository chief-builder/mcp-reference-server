import { describe, it, expect } from 'vitest';
import {
  PKCE_VERIFIER_MIN_LENGTH,
  PKCE_VERIFIER_MAX_LENGTH,
  PKCE_VERIFIER_DEFAULT_LENGTH,
  PKCE_VERIFIER_CHARSET,
  base64UrlEncode,
  isValidCodeVerifier,
  generateCodeVerifier,
  generateCodeChallenge,
  generateCodeChallengeAsync,
  generatePKCEChallenge,
  verifyCodeChallenge,
  verifyPKCE,
} from '../../../src/auth/pkce.js';

describe('PKCE Implementation', () => {
  describe('Constants', () => {
    it('should have correct minimum length', () => {
      expect(PKCE_VERIFIER_MIN_LENGTH).toBe(43);
    });

    it('should have correct maximum length', () => {
      expect(PKCE_VERIFIER_MAX_LENGTH).toBe(128);
    });

    it('should have correct default length', () => {
      expect(PKCE_VERIFIER_DEFAULT_LENGTH).toBe(64);
    });

    it('should have correct charset', () => {
      expect(PKCE_VERIFIER_CHARSET).toBe(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
      );
      expect(PKCE_VERIFIER_CHARSET).toHaveLength(66);
    });
  });

  describe('base64UrlEncode', () => {
    it('should encode buffer without padding', () => {
      const buffer = Buffer.from('test');
      const encoded = base64UrlEncode(buffer);
      expect(encoded).toBe('dGVzdA');
      expect(encoded).not.toContain('=');
    });

    it('should replace + with -', () => {
      // Buffer that produces + in standard base64
      const buffer = Buffer.from([251, 255]);
      const encoded = base64UrlEncode(buffer);
      expect(encoded).not.toContain('+');
      expect(encoded).toContain('-');
    });

    it('should replace / with _', () => {
      // Buffer that produces / in standard base64
      const buffer = Buffer.from([255, 255]);
      const encoded = base64UrlEncode(buffer);
      expect(encoded).not.toContain('/');
      expect(encoded).toContain('_');
    });

    it('should handle Uint8Array input', () => {
      const uint8 = new Uint8Array([116, 101, 115, 116]); // 'test'
      const encoded = base64UrlEncode(uint8);
      expect(encoded).toBe('dGVzdA');
    });

    it('should handle empty buffer', () => {
      const encoded = base64UrlEncode(Buffer.from([]));
      expect(encoded).toBe('');
    });
  });

  describe('isValidCodeVerifier', () => {
    it('should return true for valid verifier at minimum length', () => {
      const verifier = 'a'.repeat(43);
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('should return true for valid verifier at maximum length', () => {
      const verifier = 'A'.repeat(128);
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('should return true for verifier with all allowed characters', () => {
      const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxy';
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('should return true for verifier with special allowed characters', () => {
      // 43 chars including all special allowed characters: - . _ ~
      const verifier = 'test-verifier.with_tilde~and.more.chars-00x';
      expect(verifier).toHaveLength(43);
      expect(isValidCodeVerifier(verifier)).toBe(true);
    });

    it('should return false for verifier too short', () => {
      const verifier = 'a'.repeat(42);
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should return false for verifier too long', () => {
      const verifier = 'a'.repeat(129);
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should return false for verifier with invalid characters', () => {
      const verifier = 'a'.repeat(42) + '!';
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should return false for verifier with spaces', () => {
      const verifier = 'a'.repeat(42) + ' ';
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should return false for verifier with plus sign', () => {
      const verifier = 'a'.repeat(42) + '+';
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(isValidCodeVerifier(null as unknown as string)).toBe(false);
      expect(isValidCodeVerifier(undefined as unknown as string)).toBe(false);
      expect(isValidCodeVerifier(123 as unknown as string)).toBe(false);
      expect(isValidCodeVerifier({} as unknown as string)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidCodeVerifier('')).toBe(false);
    });
  });

  describe('generateCodeVerifier', () => {
    it('should generate verifier with default length', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(PKCE_VERIFIER_DEFAULT_LENGTH);
    });

    it('should generate verifier with specified length', () => {
      const verifier = generateCodeVerifier(100);
      expect(verifier).toHaveLength(100);
    });

    it('should generate verifier at minimum length', () => {
      const verifier = generateCodeVerifier(43);
      expect(verifier).toHaveLength(43);
    });

    it('should generate verifier at maximum length', () => {
      const verifier = generateCodeVerifier(128);
      expect(verifier).toHaveLength(128);
    });

    it('should only contain valid charset characters', () => {
      const verifier = generateCodeVerifier(128);
      const charsetRegex = /^[A-Za-z0-9\-._~]+$/;
      expect(charsetRegex.test(verifier)).toBe(true);
    });

    it('should generate valid verifiers', () => {
      for (let i = 0; i < 10; i++) {
        const verifier = generateCodeVerifier();
        expect(isValidCodeVerifier(verifier)).toBe(true);
      }
    });

    it('should generate unique verifiers', () => {
      const verifiers = new Set<string>();
      for (let i = 0; i < 100; i++) {
        verifiers.add(generateCodeVerifier());
      }
      expect(verifiers.size).toBe(100);
    });

    it('should throw for length below minimum', () => {
      expect(() => generateCodeVerifier(42)).toThrow(
        'Code verifier length must be between 43 and 128'
      );
    });

    it('should throw for length above maximum', () => {
      expect(() => generateCodeVerifier(129)).toThrow(
        'Code verifier length must be between 43 and 128'
      );
    });

    it('should throw for zero length', () => {
      expect(() => generateCodeVerifier(0)).toThrow();
    });

    it('should throw for negative length', () => {
      expect(() => generateCodeVerifier(-1)).toThrow();
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate challenge for valid verifier', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      expect(challenge).toBeDefined();
      expect(typeof challenge).toBe('string');
    });

    it('should generate BASE64URL encoded output without padding', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      expect(challenge).not.toContain('=');
      expect(challenge).not.toContain('+');
      expect(challenge).not.toContain('/');
    });

    it('should generate consistent challenge for same verifier', () => {
      const verifier = 'a'.repeat(43);
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);
      expect(challenge1).toBe(challenge2);
    });

    it('should generate different challenges for different verifiers', () => {
      const verifier1 = 'a'.repeat(43);
      const verifier2 = 'b'.repeat(43);
      const challenge1 = generateCodeChallenge(verifier1);
      const challenge2 = generateCodeChallenge(verifier2);
      expect(challenge1).not.toBe(challenge2);
    });

    // RFC 7636 Appendix B Test Vector
    it('should match RFC 7636 test vector', () => {
      // From RFC 7636 Appendix B:
      // code_verifier = dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
      // code_challenge = E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      const challenge = generateCodeChallenge(verifier);
      expect(challenge).toBe(expectedChallenge);
    });

    it('should throw for invalid verifier', () => {
      expect(() => generateCodeChallenge('short')).toThrow('Invalid code verifier');
      expect(() => generateCodeChallenge('a'.repeat(42))).toThrow('Invalid code verifier');
      expect(() => generateCodeChallenge('a'.repeat(42) + '!')).toThrow(
        'Invalid code verifier'
      );
    });
  });

  describe('generateCodeChallengeAsync', () => {
    it('should return same result as sync version', async () => {
      const verifier = generateCodeVerifier();
      const syncChallenge = generateCodeChallenge(verifier);
      const asyncChallenge = await generateCodeChallengeAsync(verifier);
      expect(asyncChallenge).toBe(syncChallenge);
    });

    it('should return a Promise', () => {
      const verifier = generateCodeVerifier();
      const result = generateCodeChallengeAsync(verifier);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('generatePKCEChallenge', () => {
    it('should return complete challenge object', () => {
      const challenge = generatePKCEChallenge();
      expect(challenge).toHaveProperty('codeVerifier');
      expect(challenge).toHaveProperty('codeChallenge');
      expect(challenge).toHaveProperty('codeChallengeMethod');
    });

    it('should always use S256 method', () => {
      const challenge = generatePKCEChallenge();
      expect(challenge.codeChallengeMethod).toBe('S256');
    });

    it('should generate valid verifier', () => {
      const challenge = generatePKCEChallenge();
      expect(isValidCodeVerifier(challenge.codeVerifier)).toBe(true);
    });

    it('should generate matching challenge', () => {
      const challenge = generatePKCEChallenge();
      const expectedChallenge = generateCodeChallenge(challenge.codeVerifier);
      expect(challenge.codeChallenge).toBe(expectedChallenge);
    });

    it('should accept custom length', () => {
      const challenge = generatePKCEChallenge(100);
      expect(challenge.codeVerifier).toHaveLength(100);
    });

    it('should use default length when not specified', () => {
      const challenge = generatePKCEChallenge();
      expect(challenge.codeVerifier).toHaveLength(PKCE_VERIFIER_DEFAULT_LENGTH);
    });
  });

  describe('verifyCodeChallenge', () => {
    it('should verify valid verifier/challenge pair with S256', async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      const result = await verifyCodeChallenge(verifier, challenge, 'S256');
      expect(result).toBe(true);
    });

    it('should verify with default S256 method', async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      const result = await verifyCodeChallenge(verifier, challenge);
      expect(result).toBe(true);
    });

    it('should reject mismatched verifier/challenge', async () => {
      const verifier = generateCodeVerifier();
      const wrongChallenge = 'invalid-challenge';
      const result = await verifyCodeChallenge(verifier, wrongChallenge, 'S256');
      expect(result).toBe(false);
    });

    it('should reject invalid verifier format', async () => {
      const verifier = 'too-short';
      const challenge = 'some-challenge';
      const result = await verifyCodeChallenge(verifier, challenge, 'S256');
      expect(result).toBe(false);
    });

    it('should throw for plain method', async () => {
      const verifier = generateCodeVerifier();
      await expect(verifyCodeChallenge(verifier, verifier, 'plain')).rejects.toThrow(
        "'plain' code challenge method is not supported per MCP specification"
      );
    });

    it('should throw for unsupported method', async () => {
      const verifier = generateCodeVerifier();
      await expect(
        verifyCodeChallenge(verifier, 'challenge', 'SHA512' as 'S256')
      ).rejects.toThrow('Unsupported code challenge method');
    });

    // RFC 7636 test vector verification
    it('should verify RFC 7636 test vector', async () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      const result = await verifyCodeChallenge(verifier, challenge, 'S256');
      expect(result).toBe(true);
    });
  });

  describe('verifyPKCE (legacy)', () => {
    it('should verify valid verifier/challenge pair', () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      const result = verifyPKCE(verifier, challenge);
      expect(result).toBe(true);
    });

    it('should reject mismatched pair', () => {
      const verifier = generateCodeVerifier();
      const wrongChallenge = 'invalid-challenge';
      const result = verifyPKCE(verifier, wrongChallenge);
      expect(result).toBe(false);
    });

    it('should reject invalid verifier', () => {
      const result = verifyPKCE('short', 'challenge');
      expect(result).toBe(false);
    });

    it('should verify RFC 7636 test vector', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      const result = verifyPKCE(verifier, challenge);
      expect(result).toBe(true);
    });
  });

  describe('Security Properties', () => {
    it('should generate cryptographically random verifiers', () => {
      // Statistical test: generated verifiers should have good entropy
      const verifiers = [];
      for (let i = 0; i < 1000; i++) {
        verifiers.push(generateCodeVerifier(64));
      }

      // All should be unique
      const unique = new Set(verifiers);
      expect(unique.size).toBe(1000);

      // Check character distribution (rough test)
      const charCounts = new Map<string, number>();
      for (const v of verifiers) {
        for (const c of v) {
          charCounts.set(c, (charCounts.get(c) || 0) + 1);
        }
      }

      // Each character should appear (66 chars in charset)
      // With 64000 total chars, each should appear ~970 times on average
      for (const char of PKCE_VERIFIER_CHARSET) {
        const count = charCounts.get(char) || 0;
        // Allow significant variance but ensure reasonable distribution
        expect(count).toBeGreaterThan(500);
        expect(count).toBeLessThan(1500);
      }
    });

    it('should be resistant to timing attacks in verification', async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      // Same-length but wrong challenge
      const wrongChallenge = 'A'.repeat(challenge.length);

      // Both should work without timing differences visible in test
      // (actual timing attack resistance comes from implementation)
      const result1 = await verifyCodeChallenge(verifier, challenge, 'S256');
      const result2 = await verifyCodeChallenge(verifier, wrongChallenge, 'S256');

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should handle timing-safe comparison for equal challenges', async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      // Verify multiple times to ensure consistent behavior
      for (let i = 0; i < 10; i++) {
        expect(await verifyCodeChallenge(verifier, challenge, 'S256')).toBe(true);
      }
    });

    it('should handle timing-safe comparison for unequal challenges of same length', async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      // Create wrong challenges at different character positions
      const wrongStart = 'X' + challenge.slice(1);
      const wrongEnd = challenge.slice(0, -1) + 'X';
      const wrongMiddle = challenge.slice(0, 20) + 'X' + challenge.slice(21);

      expect(await verifyCodeChallenge(verifier, wrongStart, 'S256')).toBe(false);
      expect(await verifyCodeChallenge(verifier, wrongEnd, 'S256')).toBe(false);
      expect(await verifyCodeChallenge(verifier, wrongMiddle, 'S256')).toBe(false);
    });

    it('should handle timing-safe comparison for different length challenges', async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      // Challenges of different lengths
      const shorterChallenge = challenge.slice(0, -5);
      const longerChallenge = challenge + 'XXXXX';

      expect(await verifyCodeChallenge(verifier, shorterChallenge, 'S256')).toBe(false);
      expect(await verifyCodeChallenge(verifier, longerChallenge, 'S256')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle verifier with all same characters', () => {
      const verifier = 'a'.repeat(43);
      expect(isValidCodeVerifier(verifier)).toBe(true);
      const challenge = generateCodeChallenge(verifier);
      expect(verifyPKCE(verifier, challenge)).toBe(true);
    });

    it('should handle verifier with all special characters', () => {
      const verifier = '-._~'.repeat(11) + '~'; // 44 chars + 1 = 45 total
      expect(isValidCodeVerifier(verifier)).toBe(true);
      const challenge = generateCodeChallenge(verifier);
      expect(verifyPKCE(verifier, challenge)).toBe(true);
    });

    it('should handle maximum length verifier', () => {
      const verifier = generateCodeVerifier(128);
      const challenge = generateCodeChallenge(verifier);
      expect(verifyPKCE(verifier, challenge)).toBe(true);
    });

    it('should handle minimum length verifier', () => {
      const verifier = generateCodeVerifier(43);
      const challenge = generateCodeChallenge(verifier);
      expect(verifyPKCE(verifier, challenge)).toBe(true);
    });

    it('should fail at boundary -1 (42 characters)', () => {
      const verifier = 'a'.repeat(42);
      expect(isValidCodeVerifier(verifier)).toBe(false);
      expect(() => generateCodeChallenge(verifier)).toThrow('Invalid code verifier');
    });

    it('should fail at boundary +1 (129 characters)', () => {
      const verifier = 'a'.repeat(129);
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should generate different challenges for nearly-identical verifiers', () => {
      const verifier1 = 'a'.repeat(43);
      const verifier2 = 'a'.repeat(42) + 'b';
      const challenge1 = generateCodeChallenge(verifier1);
      const challenge2 = generateCodeChallenge(verifier2);
      expect(challenge1).not.toBe(challenge2);
    });

    it('should reject verifier with trailing space', () => {
      const verifier = 'a'.repeat(42) + ' ';
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should reject verifier with leading space', () => {
      const verifier = ' ' + 'a'.repeat(42);
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should reject verifier with embedded newline', () => {
      const verifier = 'a'.repeat(21) + '\n' + 'a'.repeat(21);
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should reject verifier with equals sign (not in charset)', () => {
      const verifier = 'a'.repeat(42) + '=';
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should reject verifier with forward slash (not in charset)', () => {
      const verifier = 'a'.repeat(42) + '/';
      expect(isValidCodeVerifier(verifier)).toBe(false);
    });

    it('should handle all valid characters at boundaries', () => {
      // Test verifier using only special chars at min length
      const specialOnly = '-._~'.repeat(10) + '-._';  // 43 chars
      expect(isValidCodeVerifier(specialOnly)).toBe(true);
      expect(verifyPKCE(specialOnly, generateCodeChallenge(specialOnly))).toBe(true);
    });

    it('should produce consistent challenge length', () => {
      // SHA-256 produces 32 bytes = 256 bits
      // Base64URL encodes 3 bytes to 4 chars, 32 bytes = 43 chars (no padding)
      for (let i = 0; i < 10; i++) {
        const verifier = generateCodeVerifier();
        const challenge = generateCodeChallenge(verifier);
        expect(challenge.length).toBe(43);
      }
    });

    it('should reject array as verifier', () => {
      expect(isValidCodeVerifier([] as unknown as string)).toBe(false);
    });
  });
});
