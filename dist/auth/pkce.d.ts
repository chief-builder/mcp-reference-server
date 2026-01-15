/**
 * PKCE (Proof Key for Code Exchange) implementation
 */
export interface PKCEChallenge {
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
}
export declare function generateCodeVerifier(length?: number): string;
export declare function generateCodeChallenge(verifier: string): string;
export declare function generatePKCEChallenge(): PKCEChallenge;
export declare function verifyPKCE(codeVerifier: string, codeChallenge: string): boolean;
//# sourceMappingURL=pkce.d.ts.map