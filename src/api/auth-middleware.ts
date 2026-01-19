/**
 * Authentication Middleware for API Routes
 *
 * Validates Bearer tokens on protected /api/* routes.
 * For MVP, performs simple JWT format and expiration validation.
 */

import { Request, Response, NextFunction } from 'express';

// =============================================================================
// Types
// =============================================================================

export interface AuthenticatedRequest extends Request {
  /** Authenticated user context */
  auth?: {
    /** Subject (user ID) from token */
    sub: string;
    /** Token expiration timestamp */
    exp: number;
    /** Granted scopes */
    scope?: string;
    /** Raw token (for forwarding if needed) */
    token: string;
  };
}

export interface AuthMiddlewareOptions {
  /** Skip auth for specific paths (relative to /api, e.g., ['/health']) */
  skipPaths?: string[];
  /** Allow unauthenticated requests to pass through (useful for development) */
  allowUnauthenticated?: boolean;
}

// =============================================================================
// JWT Helpers
// =============================================================================

interface JwtPayload {
  sub: string;
  exp: number;
  iat: number;
  scope?: string;
  [key: string]: unknown;
}

/**
 * Decode a JWT token without verification (for MVP)
 *
 * NOTE: In production, this should verify the signature using JWKS.
 * For MVP, we only validate structure and expiration.
 */
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode payload (middle part)
    const payloadBase64 = parts[1];
    if (!payloadBase64) {
      return null;
    }

    // Add padding if needed for base64url decoding
    const paddedPayload = payloadBase64 + '='.repeat((4 - (payloadBase64.length % 4)) % 4);
    const payloadJson = Buffer.from(paddedPayload, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;

    // Validate required fields
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number'
    ) {
      return null;
    }

    return payload as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired
 */
function isTokenExpired(payload: JwtPayload, toleranceSeconds = 0): boolean {
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now - toleranceSeconds;
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Create authentication middleware
 *
 * @param options - Middleware options
 * @returns Express middleware function
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  const { skipPaths = [], allowUnauthenticated = false } = options;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Check if path should skip auth
    const requestPath = req.path;
    if (skipPaths.some((path) => requestPath === path || requestPath.startsWith(path + '/'))) {
      next();
      return;
    }

    // Extract Bearer token from Authorization header
    const authHeader = req.get('Authorization');
    if (!authHeader) {
      if (allowUnauthenticated) {
        next();
        return;
      }
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Authorization header',
      });
      return;
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid Authorization header format. Expected: Bearer <token>',
      });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing token in Authorization header',
      });
      return;
    }

    // Decode and validate JWT
    const payload = decodeJwt(token);
    if (!payload) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token format',
      });
      return;
    }

    // Check expiration (with 60 second tolerance for clock skew)
    if (isTokenExpired(payload, 60)) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired',
        code: 'token_expired',
      });
      return;
    }

    // Attach auth context to request
    const authContext: AuthenticatedRequest['auth'] = {
      sub: payload.sub,
      exp: payload.exp,
      token,
    };
    // Only add scope if it's a string (satisfies exactOptionalPropertyTypes)
    if (typeof payload.scope === 'string') {
      authContext.scope = payload.scope;
    }
    req.auth = authContext;

    next();
  };
}

/**
 * Require authentication middleware (stricter version)
 *
 * Always requires valid auth, unlike createAuthMiddleware which can allow unauthenticated.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }
  next();
}

/**
 * Helper to get auth context from request
 */
export function getAuthContext(req: Request): AuthenticatedRequest['auth'] | undefined {
  return (req as AuthenticatedRequest).auth;
}

// =============================================================================
// Development Helpers
// =============================================================================

/**
 * Create a development-only mock auth middleware
 *
 * Bypasses authentication and sets a mock user context.
 * ONLY use in development mode!
 */
export function createMockAuthMiddleware() {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    // Set mock auth context
    req.auth = {
      sub: 'dev-user',
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      scope: 'openid profile',
      token: 'mock-token',
    };
    next();
  };
}
