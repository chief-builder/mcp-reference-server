/**
 * OAuth metadata discovery endpoints
 */

export interface OAuthServerMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  tokenEndpointAuthMethodsSupported?: string[];
  jwksUri?: string;
  registrationEndpoint?: string;
  scopesSupported?: string[];
  responseTypesSupported: string[];
  grantTypesSupported?: string[];
  codeChallengeMethodsSupported?: string[];
}

export function getWellKnownPath(): string {
  return '/.well-known/oauth-authorization-server';
}

export function buildMetadata(issuer: string): OAuthServerMetadata {
  return {
    issuer,
    authorizationEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/token`,
    tokenEndpointAuthMethodsSupported: ['client_secret_basic', 'client_secret_post', 'none'],
    responseTypesSupported: ['code'],
    grantTypesSupported: ['authorization_code', 'refresh_token', 'client_credentials'],
    codeChallengeMethodsSupported: ['S256'],
  };
}
