---
layout: page
title: Auth API
---

# Auth API Reference

Exports for OAuth 2.1 authentication, PKCE, token handling, and metadata discovery.

## OAuth Validator (`auth/oauth`)

### OAuthValidator Class

```typescript
class OAuthValidator {
  constructor(options: OAuthValidatorOptions);
  validate(request: Request): Promise<TokenInfo>;
  validateScopes(tokenInfo: TokenInfo, requiredScopes: string[]): void;
}

interface OAuthValidatorOptions {
  issuer: string;
  audience?: string;
  jwksUri?: string;
  introspectionEndpoint?: string;
  clientId?: string;
  clientSecret?: string;
}

interface TokenInfo {
  sub: string;
  scope: string;
  exp: number;
  iat: number;
  iss: string;
  aud?: string;
  client_id?: string;
}
```

### Usage

```typescript
import { OAuthValidator, HttpTransport } from 'mcp-reference-server';

const validator = new OAuthValidator({
  issuer: 'https://auth.example.com',
  audience: 'my-mcp-server',
  jwksUri: 'https://auth.example.com/.well-known/jwks.json',
});

const transport = new HttpTransport({
  port: 3000,
  authValidator: validator,
});
```

## PKCE Support (`auth/pkce`)

### Functions

| Function | Description |
|----------|-------------|
| `generateCodeVerifier()` | Generate random code verifier |
| `generateCodeChallenge(verifier)` | Create S256 code challenge |
| `validateCodeVerifier(verifier, challenge)` | Verify PKCE codes match |

### Usage

```typescript
import { generateCodeVerifier, generateCodeChallenge } from 'mcp-reference-server';

// Client generates verifier
const verifier = generateCodeVerifier();

// Client sends challenge with auth request
const challenge = await generateCodeChallenge(verifier);

// Authorization request includes:
// code_challenge=<challenge>
// code_challenge_method=S256
```

## Token Handling (`auth/tokens`)

### Functions

| Function | Description |
|----------|-------------|
| `parseAuthorizationHeader(header)` | Extract token from header |
| `decodeJwt(token)` | Decode JWT without verification |
| `verifyJwt(token, jwks)` | Verify JWT signature |
| `isTokenExpired(tokenInfo)` | Check token expiration |

### Types

```typescript
interface JwtHeader {
  alg: string;
  typ: string;
  kid?: string;
}

interface JwtPayload {
  iss: string;
  sub: string;
  aud?: string | string[];
  exp: number;
  iat: number;
  scope?: string;
  [key: string]: unknown;
}
```

### Usage

```typescript
import { parseAuthorizationHeader, verifyJwt } from 'mcp-reference-server';

const token = parseAuthorizationHeader('Bearer eyJ...');
const payload = await verifyJwt(token, jwksClient);

if (isTokenExpired(payload)) {
  throw new Error('Token expired');
}
```

## Metadata Discovery (`auth/discovery`)

### Functions

| Function | Description |
|----------|-------------|
| `fetchAuthServerMetadata(issuer)` | Fetch OAuth server metadata |
| `getProtectedResourceMetadata()` | Get server's resource metadata |

### Types

```typescript
interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
}

interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
}
```

### Usage

```typescript
import { fetchAuthServerMetadata } from 'mcp-reference-server';

const metadata = await fetchAuthServerMetadata('https://auth.example.com');
console.log(metadata.authorization_endpoint);
console.log(metadata.token_endpoint);
```

## M2M Extension (`extensions/oauth-m2m`)

### M2MAuthProvider Class

```typescript
class M2MAuthProvider {
  constructor(options: M2MAuthOptions);
  getToken(): Promise<string>;
  refreshToken(): Promise<string>;
  revokeToken(): Promise<void>;
}

interface M2MAuthOptions {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}
```

### Usage

```typescript
import { M2MAuthProvider } from 'mcp-reference-server';

const auth = new M2MAuthProvider({
  tokenEndpoint: 'https://auth.example.com/token',
  clientId: 'my-service',
  clientSecret: 'secret',
  scope: 'mcp:write mcp:tool:calculate',
});

const token = await auth.getToken();
```

## Scopes (`auth/scopes`)

MCP uses a hierarchical scope system with three base scopes and tool-specific scopes.

### Base Scopes

| Scope | Description | Operations |
|-------|-------------|------------|
| `mcp:read` | Read-only access | `tools/list`, `resources/list`, `prompts/list`, `resources/read`, `prompts/get` |
| `mcp:write` | Read and write access | All read operations + `tools/call`, `resources/subscribe`, `logging/setLevel`, `sampling/createMessage` |
| `mcp:admin` | Full administrative access | All operations + `server/shutdown` |

### Tool-Specific Scopes

For fine-grained control, tool-specific scopes use the `mcp:tool:*` pattern:

| Scope | Description |
|-------|-------------|
| `mcp:tool:calculate` | Access to the calculate tool |
| `mcp:tool:roll_dice` | Access to the roll_dice tool |
| `mcp:tool:tell_fortune` | Access to the tell_fortune tool |

### Scope Inheritance (SEP-835)

Parent scopes imply child permissions:

```
mcp:admin
├── mcp:write
│   └── mcp:read
```

A token with `mcp:admin` automatically has `mcp:write` and `mcp:read` permissions.
A token with `mcp:write` automatically has `mcp:read` permissions.

### Constants

```typescript
import { MCP_SCOPES, TOOL_SCOPE_PREFIX, TOOL_SCOPES } from 'mcp-reference-server';

MCP_SCOPES.READ   // 'mcp:read'
MCP_SCOPES.WRITE  // 'mcp:write'
MCP_SCOPES.ADMIN  // 'mcp:admin'

TOOL_SCOPE_PREFIX // 'mcp:tool:'

TOOL_SCOPES.CALCULATE    // 'mcp:tool:calculate'
TOOL_SCOPES.ROLL_DICE    // 'mcp:tool:roll_dice'
TOOL_SCOPES.TELL_FORTUNE // 'mcp:tool:tell_fortune'
```

### Utility Functions

| Function | Description |
|----------|-------------|
| `parseScopes(scopeString)` | Parse space-separated scope string into array |
| `scopesToString(scopes)` | Convert scope array to space-separated string |
| `isToolScope(scope)` | Check if scope is a tool-specific scope |
| `getToolNameFromScope(scope)` | Extract tool name from `mcp:tool:*` scope |
| `buildToolScope(toolName)` | Build `mcp:tool:toolName` scope string |
| `getAllMcpScopes()` | Get all base MCP scopes |
| `getAllToolScopes()` | Get all defined tool scopes |
| `checkScopeWithInheritance(tokenScopes, required)` | Quick check with inheritance |

### ScopeManager Class

Manages OAuth scope validation and enforcement with inheritance support.

```typescript
class ScopeManager {
  constructor(config?: Partial<ScopeManagerConfig>);

  /** Check if token scopes include required scope(s) */
  hasScope(tokenScopes: string[] | string, required: string | string[]): boolean;

  /** Check scope with inheritance (admin → write → read) */
  hasScopeWithInheritance(tokenScopes: string[] | string, required: string): boolean;

  /** Check all required scopes with inheritance */
  checkScopes(tokenScopes: string[] | string, required: string[]): ScopeCheckResult;

  /** Get scopes required for an MCP method */
  getRequiredScopes(method: string, toolName?: string): string[];

  /** Validate method access, throws InsufficientScopeError if denied */
  validateMethodAccess(
    tokenScopes: string[] | string,
    method: string,
    toolName?: string
  ): void;

  /** Validate tool access with optional tool-specific scope */
  validateToolAccess(
    tokenScopes: string[] | string,
    toolName: string,
    requireToolScope?: boolean
  ): void;

  /** Get all effective scopes including inherited ones */
  getEffectiveScopes(scopes: string[] | string): string[];

  /** Build 403 response with WWW-Authenticate header */
  build403Response(error: InsufficientScopeError): {
    status: number;
    headers: Record<string, string>;
    body: { error: string; error_description: string; required_scope: string };
  };
}

interface ScopeManagerConfig {
  /** Resource metadata URL for WWW-Authenticate header */
  resourceMetadataUrl?: string;
  /** Realm for WWW-Authenticate header */
  realm?: string;
  /** Custom method-to-scope mapping (merged with defaults) */
  customMethodScopes?: Record<string, string[]>;
}

interface ScopeCheckResult {
  allowed: boolean;
  missingScopes?: string[];
  message: string;
}
```

### InsufficientScopeError Class

Error thrown when token lacks required scope.

```typescript
class InsufficientScopeError extends Error {
  readonly code = 'insufficient_scope';
  readonly httpStatus = 403;
  readonly requiredScopes: string[];
  readonly tokenScopes: string[];

  constructor(
    requiredScopes: string[],
    tokenScopes: string[],
    message?: string
  );

  /** Get required scope string for WWW-Authenticate header */
  getRequiredScopeString(): string;

  /** Build WWW-Authenticate header for this error */
  buildWwwAuthenticateHeader(resourceMetadataUrl: string, realm?: string): string;
}
```

### Method-to-Scope Mapping

Default scope requirements for MCP methods:

| Method | Required Scope |
|--------|----------------|
| `tools/list` | `mcp:read` |
| `resources/list` | `mcp:read` |
| `prompts/list` | `mcp:read` |
| `resources/read` | `mcp:read` |
| `prompts/get` | `mcp:read` |
| `tools/call` | `mcp:write` |
| `resources/subscribe` | `mcp:write` |
| `resources/unsubscribe` | `mcp:write` |
| `logging/setLevel` | `mcp:write` |
| `sampling/createMessage` | `mcp:write` |
| `server/shutdown` | `mcp:admin` |

### Usage

```typescript
import {
  ScopeManager,
  InsufficientScopeError,
  parseScopes,
  buildToolScope,
} from 'mcp-reference-server';

const scopeManager = new ScopeManager({
  resourceMetadataUrl: 'https://mcp.example.com/.well-known/oauth-protected-resource',
  realm: 'mcp',
});

// Validate method access
try {
  scopeManager.validateMethodAccess(['mcp:read'], 'tools/call');
} catch (error) {
  if (error instanceof InsufficientScopeError) {
    const response = scopeManager.build403Response(error);
    // response.headers['WWW-Authenticate'] contains the header
  }
}

// Check scopes with inheritance
const result = scopeManager.checkScopes('mcp:admin', ['mcp:read', 'mcp:write']);
console.log(result.allowed); // true (admin implies write implies read)

// Get effective scopes
const effective = scopeManager.getEffectiveScopes('mcp:admin');
console.log(effective); // ['mcp:admin', 'mcp:write', 'mcp:read']
```

## Related

- [Authentication Guide](../guides/authentication) - OAuth concepts
- [Environment Reference](../reference/environment) - Auth variables
