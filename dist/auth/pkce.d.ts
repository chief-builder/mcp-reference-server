/**
 * PKCE (Proof Key for Code Exchange) implementation
 * Per OAuth 2.1 Section 4.1.1 and RFC 7636
 */
/**
 * Constants per OAuth 2.1 specification
 */
export declare const PKCE_VERIFIER_MIN_LENGTH = 43;
export declare const PKCE_VERIFIER_MAX_LENGTH = 128;
export declare const PKCE_VERIFIER_DEFAULT_LENGTH = 64;
export declare const PKCE_VERIFIER_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
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
export declare function base64UrlEncode(buffer: Buffer | Uint8Array): string;
/**
 * Validates that a code verifier meets OAuth 2.1 requirements:
 * - Length: 43-128 characters
 * - Characters: [A-Z] [a-z] [0-9] - . _ ~ (unreserved URI characters)
 */
export declare function isValidCodeVerifier(verifier: string): boolean;
/**
 * Generates a cryptographically random code verifier
 * Per OAuth 2.1 Section 4.1.1
 *
 * @param length - Length of the verifier (43-128, default 64)
 * @returns Cryptographically random code verifier string
 * @throws Error if length is outside valid range
 */
export declare function generateCodeVerifier(length?: number): string;
/**
 * Generates a code challenge from a code verifier using S256 method
 * Algorithm: BASE64URL(SHA256(code_verifier))
 *
 * @param verifier - The code verifier string
 * @returns BASE64URL-encoded SHA-256 hash of the verifier (no padding)
 * @throws Error if verifier is invalid
 */
export declare function generateCodeChallenge(verifier: string): string;
/**
 * Async version of generateCodeChallenge for API consistency
 * (computation is actually synchronous but wrapped for interface compatibility)
 */
export declare function generateCodeChallengeAsync(verifier: string): Promise<string>;
/**
 * Generates a complete PKCE challenge pair
 *
 * @param length - Optional length for the code verifier (43-128, default 64)
 * @returns Object containing code verifier, challenge, and method
 */
export declare function generatePKCEChallenge(length?: number): PKCEChallenge;
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
export declare function verifyCodeChallenge(verifier: string, challenge: string, method?: CodeChallengeMethod): Promise<boolean>;
/**
 * Legacy function for backward compatibility
 * @deprecated Use verifyCodeChallenge instead
 */
export declare function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean;
//# sourceMappingURL=pkce.d.ts.map