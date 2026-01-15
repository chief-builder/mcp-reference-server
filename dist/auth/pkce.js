/**
 * PKCE (Proof Key for Code Exchange) implementation
 */
import { randomBytes, createHash } from 'node:crypto';
export function generateCodeVerifier(length = 43) {
    const buffer = randomBytes(length);
    return buffer
        .toString('base64url')
        .slice(0, length);
}
export function generateCodeChallenge(verifier) {
    const hash = createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
}
export function generatePKCEChallenge() {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    return {
        codeVerifier,
        codeChallenge,
        codeChallengeMethod: 'S256',
    };
}
export function verifyPKCE(codeVerifier, codeChallenge) {
    const expectedChallenge = generateCodeChallenge(codeVerifier);
    return expectedChallenge === codeChallenge;
}
//# sourceMappingURL=pkce.js.map