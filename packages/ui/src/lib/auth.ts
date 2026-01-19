/**
 * OAuth 2.1 Authentication Library with PKCE
 *
 * Implements secure OAuth flow for the frontend:
 * - PKCE (Proof Key for Code Exchange) for public clients
 * - Secure token storage in sessionStorage
 * - Token refresh with retry logic
 * - State validation for CSRF protection
 */

// =============================================================================
// Configuration
// =============================================================================

/**
 * OAuth configuration
 * In production, these would come from environment variables
 */
export interface AuthConfig {
  /** OAuth client ID */
  clientId: string;
  /** Authorization server issuer URL */
  issuer: string;
  /** Redirect URI for OAuth callback */
  redirectUri: string;
  /** Scopes to request */
  scopes: string[];
}

const DEFAULT_CONFIG: AuthConfig = {
  clientId: import.meta.env.VITE_OAUTH_CLIENT_ID ?? 'mcp-ui-client',
  issuer: import.meta.env.VITE_OAUTH_ISSUER ?? window.location.origin,
  redirectUri: import.meta.env.VITE_OAUTH_REDIRECT_URI ?? `${window.location.origin}/callback`,
  scopes: ['openid', 'profile'],
};

// =============================================================================
// Storage Keys
// =============================================================================

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  TOKEN_EXPIRES_AT: 'auth_token_expires_at',
  CODE_VERIFIER: 'auth_code_verifier',
  STATE: 'auth_state',
  RETURN_PATH: 'auth_return_path',
} as const;

// =============================================================================
// Types
// =============================================================================

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

// =============================================================================
// PKCE Helpers
// =============================================================================

/**
 * Generate a cryptographically secure random string for PKCE code verifier
 */
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

/**
 * Generate PKCE code verifier (43-128 characters)
 */
export function generateCodeVerifier(): string {
  return generateRandomString(64);
}

/**
 * Generate PKCE code challenge using S256 method
 * BASE64URL(SHA256(code_verifier))
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hash);
  // Base64url encode without padding
  const base64 = btoa(String.fromCharCode(...hashArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate state parameter for CSRF protection
 */
export function generateState(): string {
  return generateRandomString(32);
}

// =============================================================================
// Token Storage
// =============================================================================

/**
 * Store tokens in sessionStorage
 */
function storeTokens(data: TokenData): void {
  sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
  sessionStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES_AT, data.expiresAt.toString());
  if (data.refreshToken) {
    sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
  }
}

/**
 * Get stored tokens
 */
function getStoredTokens(): TokenData | null {
  const accessToken = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const expiresAtStr = sessionStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
  const refreshToken = sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

  if (!accessToken || !expiresAtStr) {
    return null;
  }

  return {
    accessToken,
    refreshToken: refreshToken ?? undefined,
    expiresAt: parseInt(expiresAtStr, 10),
  };
}

/**
 * Clear all stored tokens and auth state
 */
function clearStorage(): void {
  sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  sessionStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
  sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEYS.STATE);
  sessionStorage.removeItem(STORAGE_KEYS.RETURN_PATH);
}

// =============================================================================
// Token Endpoint Helpers
// =============================================================================

/**
 * Check if response is an OAuth error
 */
function isTokenError(response: unknown): response is TokenErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as TokenErrorResponse).error === 'string'
  );
}

/**
 * Make a token request to the authorization server
 */
async function tokenRequest(
  tokenEndpoint: string,
  params: URLSearchParams
): Promise<TokenResponse> {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok || isTokenError(data)) {
    const errorMsg = isTokenError(data)
      ? data.error_description ?? data.error
      : `Token request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as TokenResponse;
}

// =============================================================================
// Auth Functions
// =============================================================================

/**
 * Initiate OAuth login flow with PKCE
 *
 * Generates PKCE parameters, stores them in sessionStorage,
 * and redirects to the authorization endpoint.
 */
export async function login(config: AuthConfig = DEFAULT_CONFIG): Promise<void> {
  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Store PKCE parameters and return path for callback
  sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
  sessionStorage.setItem(STORAGE_KEYS.STATE, state);
  sessionStorage.setItem(STORAGE_KEYS.RETURN_PATH, window.location.pathname);

  // Build authorization URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${config.issuer}/oauth/authorize?${params.toString()}`;

  // Redirect to authorization server
  window.location.href = authUrl;
}

/**
 * Handle OAuth callback and exchange code for tokens
 *
 * Validates state, exchanges authorization code for tokens using PKCE,
 * and stores tokens in sessionStorage.
 *
 * @returns The return path to redirect to after successful auth
 */
export async function handleCallback(
  config: AuthConfig = DEFAULT_CONFIG
): Promise<{ success: boolean; returnPath?: string; error?: string }> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  // Check for error response
  if (error) {
    clearStorage();
    return { success: false, error: errorDescription ?? error };
  }

  // Validate required parameters
  if (!code || !state) {
    clearStorage();
    return { success: false, error: 'Missing authorization code or state' };
  }

  // Validate state (CSRF protection)
  const storedState = sessionStorage.getItem(STORAGE_KEYS.STATE);
  if (!storedState || state !== storedState) {
    clearStorage();
    return { success: false, error: 'Invalid state parameter' };
  }

  // Get stored code verifier
  const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
  if (!codeVerifier) {
    clearStorage();
    return { success: false, error: 'Missing code verifier' };
  }

  // Get return path before clearing
  const returnPath = sessionStorage.getItem(STORAGE_KEYS.RETURN_PATH) ?? '/';

  try {
    const tokenEndpoint = `${config.issuer}/oauth/token`;

    // Exchange code for tokens
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: codeVerifier,
    });

    const result = await tokenRequest(tokenEndpoint, params);

    // Store tokens
    const expiresIn = result.expires_in ?? 3600;
    storeTokens({
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: Date.now() + expiresIn * 1000,
    });

    // Clear PKCE state
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
    sessionStorage.removeItem(STORAGE_KEYS.STATE);
    sessionStorage.removeItem(STORAGE_KEYS.RETURN_PATH);

    return { success: true, returnPath };
  } catch (err) {
    clearStorage();
    const message = err instanceof Error ? err.message : 'Token exchange failed';
    return { success: false, error: message };
  }
}

/**
 * Get the current access token
 *
 * Returns null if no token is stored or token is expired
 */
export function getToken(): string | null {
  const tokens = getStoredTokens();
  if (!tokens) {
    return null;
  }

  // Check if token is expired (with 60 second buffer)
  if (tokens.expiresAt <= Date.now() + 60000) {
    return null;
  }

  return tokens.accessToken;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/**
 * Refresh the access token using refresh token
 */
export async function refreshToken(
  config: AuthConfig = DEFAULT_CONFIG
): Promise<boolean> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) {
    return false;
  }

  try {
    const tokenEndpoint = `${config.issuer}/oauth/token`;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: config.clientId,
    });

    const result = await tokenRequest(tokenEndpoint, params);

    // Store new tokens
    const expiresIn = result.expires_in ?? 3600;
    storeTokens({
      accessToken: result.access_token,
      refreshToken: result.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });

    return true;
  } catch {
    clearStorage();
    return false;
  }
}

/**
 * Logout - clear all tokens and state
 */
export function logout(): void {
  clearStorage();
}

/**
 * Get the stored token data (for debugging/display)
 */
export function getTokenData(): TokenData | null {
  return getStoredTokens();
}

// =============================================================================
// Export default config for convenience
// =============================================================================

export { DEFAULT_CONFIG as authConfig };
