/**
 * Token validation and refresh
 */

export interface TokenPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  scope?: string;
  [key: string]: unknown;
}

export interface TokenValidationOptions {
  issuer: string;
  audience: string | string[];
  clockTolerance?: number;
}

export async function validateAccessToken(
  _token: string,
  _options: TokenValidationOptions
): Promise<TokenPayload> {
  // TODO: Implement token validation
  throw new Error('Not implemented');
}

export async function refreshAccessToken(
  _refreshToken: string,
  _tokenEndpoint: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  // TODO: Implement token refresh
  throw new Error('Not implemented');
}

export function isTokenExpired(payload: TokenPayload, toleranceSeconds = 0): boolean {
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now - toleranceSeconds;
}
