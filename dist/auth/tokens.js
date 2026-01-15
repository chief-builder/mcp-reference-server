/**
 * Token validation and refresh
 */
export async function validateAccessToken(_token, _options) {
    // TODO: Implement token validation
    throw new Error('Not implemented');
}
export async function refreshAccessToken(_refreshToken, _tokenEndpoint) {
    // TODO: Implement token refresh
    throw new Error('Not implemented');
}
export function isTokenExpired(payload, toleranceSeconds = 0) {
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now - toleranceSeconds;
}
//# sourceMappingURL=tokens.js.map