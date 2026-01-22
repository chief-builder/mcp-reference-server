/**
 * JWT Issuer for OAuth Server
 *
 * Issues and verifies JWTs using the jose library.
 * Uses HS256 (symmetric) signing for development simplicity.
 */

import * as jose from 'jose';
import { randomBytes } from 'node:crypto';

// =============================================================================
// Types
// =============================================================================

export interface AccessTokenClaims {
  /** Subject (user ID) */
  sub: string;
  /** Audience (client ID) */
  aud: string;
  /** Granted scopes (space-separated) */
  scope: string;
}

export interface RefreshTokenPayload {
  /** Subject (user ID) */
  sub: string;
  /** Token type marker */
  type: 'refresh';
  /** Issued at timestamp (seconds) */
  iat: number;
  /** Expiration timestamp (seconds) */
  exp: number;
  /** JWT ID for uniqueness */
  jti: string;
}

export interface JwtIssuerOptions {
  /** Issuer URL (e.g., http://localhost:3000) */
  issuer: string;
  /** HS256 signing secret (auto-generated if not provided) */
  signingSecret?: string;
  /** Default access token TTL in seconds (default: 3600) */
  defaultAccessTokenTtl?: number;
  /** Default refresh token TTL in seconds (default: 86400) */
  defaultRefreshTokenTtl?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ACCESS_TOKEN_TTL = 3600; // 1 hour
const DEFAULT_REFRESH_TOKEN_TTL = 86400; // 24 hours
const SECRET_LENGTH_BYTES = 32; // 256 bits for HS256

// =============================================================================
// JWT Issuer Class
// =============================================================================

export class JwtIssuer {
  private readonly issuer: string;
  private readonly secret: Uint8Array;
  private readonly defaultAccessTokenTtl: number;
  private readonly defaultRefreshTokenTtl: number;

  constructor(options: JwtIssuerOptions) {
    this.issuer = options.issuer;
    this.defaultAccessTokenTtl = options.defaultAccessTokenTtl ?? DEFAULT_ACCESS_TOKEN_TTL;
    this.defaultRefreshTokenTtl = options.defaultRefreshTokenTtl ?? DEFAULT_REFRESH_TOKEN_TTL;

    // Generate or use provided signing secret
    if (options.signingSecret) {
      this.secret = new TextEncoder().encode(options.signingSecret);
    } else {
      // Auto-generate a random secret
      this.secret = randomBytes(SECRET_LENGTH_BYTES);
    }
  }

  /**
   * Get the issuer URL
   */
  getIssuer(): string {
    return this.issuer;
  }

  /**
   * Issue an access token JWT
   *
   * @param claims - Token claims (sub, aud, scope)
   * @param expiresIn - Token lifetime in seconds (uses default if not provided)
   * @returns Signed JWT string
   */
  async issueAccessToken(
    claims: AccessTokenClaims,
    expiresIn: number = this.defaultAccessTokenTtl
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jti = randomBytes(16).toString('base64url');

    const jwt = await new jose.SignJWT({
      scope: claims.scope,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.issuer)
      .setSubject(claims.sub)
      .setAudience(claims.aud)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .setJti(jti)
      .sign(this.secret);

    return jwt;
  }

  /**
   * Issue a refresh token JWT
   *
   * @param subject - User subject
   * @param expiresIn - Token lifetime in seconds (uses default if not provided)
   * @returns Signed JWT string
   */
  async issueRefreshToken(
    subject: string,
    expiresIn: number = this.defaultRefreshTokenTtl
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jti = randomBytes(16).toString('base64url');

    const jwt = await new jose.SignJWT({
      type: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.issuer)
      .setSubject(subject)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresIn)
      .setJti(jti)
      .sign(this.secret);

    return jwt;
  }

  /**
   * Verify and decode a refresh token
   *
   * @param token - The refresh token JWT
   * @returns Decoded payload
   * @throws jose.errors.JWTExpired if token is expired
   * @throws jose.errors.JWTInvalid if token is invalid
   */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    const result = await jose.jwtVerify(token, this.secret, {
      issuer: this.issuer,
    });

    const payload = result.payload;

    // Validate this is a refresh token
    if (payload['type'] !== 'refresh') {
      throw new jose.errors.JWTInvalid('Token is not a refresh token');
    }

    if (typeof payload.sub !== 'string') {
      throw new jose.errors.JWTInvalid('Missing subject claim');
    }

    if (typeof payload.iat !== 'number') {
      throw new jose.errors.JWTInvalid('Missing iat claim');
    }

    if (typeof payload.exp !== 'number') {
      throw new jose.errors.JWTInvalid('Missing exp claim');
    }

    if (typeof payload.jti !== 'string') {
      throw new jose.errors.JWTInvalid('Missing jti claim');
    }

    return {
      sub: payload.sub,
      type: 'refresh',
      iat: payload.iat,
      exp: payload.exp,
      jti: payload.jti,
    };
  }

  /**
   * Verify an access token and return its claims
   *
   * @param token - The access token JWT
   * @param expectedAudience - Expected audience (client ID)
   * @returns Decoded payload with standard claims
   * @throws jose.errors.JWTExpired if token is expired
   * @throws jose.errors.JWTInvalid if token is invalid
   */
  async verifyAccessToken(
    token: string,
    expectedAudience?: string
  ): Promise<jose.JWTPayload> {
    const options: jose.JWTVerifyOptions = {
      issuer: this.issuer,
    };

    if (expectedAudience) {
      options.audience = expectedAudience;
    }

    const result = await jose.jwtVerify(token, this.secret, options);
    return result.payload;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultIssuer: JwtIssuer | null = null;

/**
 * Get or create the default JWT issuer
 *
 * @param options - Options for creating the issuer (only used on first call)
 */
export function getJwtIssuer(options?: JwtIssuerOptions): JwtIssuer {
  if (!defaultIssuer) {
    if (!options) {
      // Use defaults based on environment
      const issuer = process.env.OAUTH_ISSUER ?? 'http://localhost:3000';
      const signingSecret = process.env.OAUTH_SIGNING_SECRET;
      const accessTokenTtlEnv = process.env.OAUTH_ACCESS_TOKEN_TTL;
      const refreshTokenTtlEnv = process.env.OAUTH_REFRESH_TOKEN_TTL;

      const envOptions: JwtIssuerOptions = { issuer };
      if (signingSecret !== undefined) {
        envOptions.signingSecret = signingSecret;
      }
      if (accessTokenTtlEnv !== undefined) {
        envOptions.defaultAccessTokenTtl = parseInt(accessTokenTtlEnv, 10);
      }
      if (refreshTokenTtlEnv !== undefined) {
        envOptions.defaultRefreshTokenTtl = parseInt(refreshTokenTtlEnv, 10);
      }

      defaultIssuer = new JwtIssuer(envOptions);
    } else {
      defaultIssuer = new JwtIssuer(options);
    }
  }
  return defaultIssuer;
}

/**
 * Reset the default issuer (useful for testing)
 */
export function resetJwtIssuer(): void {
  defaultIssuer = null;
}
