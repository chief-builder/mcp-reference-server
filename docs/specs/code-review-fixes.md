# Code Review Remediation Specification

**Version:** 1.0
**Date:** 2026-01-18
**Scope:** Critical and High severity issues only (10 issues)
**Source:** Code review results from `docs/code_review_results/`

---

## Overview

This specification defines fixes for the 2 critical and 8 high severity issues identified in the MCP Reference Server code review. The goal is to address security vulnerabilities, DoS attack vectors, and stability issues without re-implementing existing functionality.

### Issues Addressed

| ID | Severity | File | Issue |
|----|----------|------|-------|
| C1 | Critical | `transport/http.ts` | No request body size limit (DoS) |
| C2 | Critical | `observability/tracing.ts` | Incomplete stub implementation |
| H1 | High | `auth/tokens.ts` | Missing JWT signature verification |
| H2 | High | `auth/tokens.ts` | Race condition in token refresh (TOCTOU) |
| H3 | High | `auth/oauth.ts` | Timing attack in state validation |
| H4 | High | `extensions/oauth-m2m.ts` | Race condition in token caching |
| H5 | High | `protocol/pagination.ts` | Weak default cursor secret |
| H6 | High | `transport/sse.ts` | Event buffer memory leak potential |
| H7 | High | `transport/stdio.ts` | Buffer memory accumulation (DoS) |
| H8 | High | `config.ts` | Singleton pattern testing difficulties |
| H9 | High | `client/cli.ts` | Command injection vulnerability |
| H10 | High | `client/llm-provider.ts` | Mixed sync/async with require() |

---

## Technical Architecture

### New Dependencies

```json
{
  "dependencies": {
    "jose": "^5.0.0",
    "shell-quote": "^1.8.0"
  },
  "devDependencies": {
    "@types/shell-quote": "^1.7.0"
  }
}
```

### Files to Modify

1. `src/transport/http.ts` - Add body size limit
2. `src/auth/tokens.ts` - JWT verification + mutex
3. `src/auth/oauth.ts` - Timing-safe state validation
4. `src/extensions/oauth-m2m.ts` - Token cache mutex
5. `src/protocol/pagination.ts` - Fail-closed cursor secret
6. `src/transport/sse.ts` - Event listener cleanup
7. `src/transport/stdio.ts` - Max line length check
8. `src/config.ts` - Dependency injection refactor
9. `src/client/cli.ts` - Shell-quote parsing
10. `src/client/llm-provider.ts` - Async imports only

### Files to Delete

1. `src/observability/tracing.ts` - Dead code (telemetry.ts provides tracing)

---

## Implementation Details

### C1: HTTP Body Size Limit

**File:** `src/transport/http.ts`
**Location:** `setupMiddleware()` method

**Current:**
```typescript
private setupMiddleware(): void {
  this.app.use(express.json());
}
```

**Fixed:**
```typescript
private setupMiddleware(): void {
  this.app.use(express.json({ limit: '100kb' }));
}
```

**Rationale:** 100KB is generous for JSON-RPC messages while preventing memory exhaustion from malicious large payloads.

---

### C2: Delete Tracing Stub

**File:** `src/observability/tracing.ts`

**Action:** Delete the entire file.

**Rationale:**
- The file contains only stub implementations with TODO comments
- `src/observability/telemetry.ts` already provides complete OpenTelemetry tracing
- Keeping dead code causes confusion

**Migration:**
- Remove export from `src/index.ts` (line 55): `export * from './observability/tracing.js';`
- Search codebase for any imports of `tracing.ts` and update to use `telemetry.ts`

---

### H1: JWT Signature Verification

**File:** `src/auth/tokens.ts`
**New dependency:** `jose`

**Current:** `validateJwtFormat()` only validates structure, not signature.

**Implementation:**

```typescript
import * as jose from 'jose';

interface JwksConfig {
  issuer: string;
  jwksUri: string;
}

// Cache JWKS for performance
const jwksCache = new Map<string, jose.JWTVerifyGetKey>();

async function getJwks(jwksUri: string): Promise<jose.JWTVerifyGetKey> {
  let jwks = jwksCache.get(jwksUri);
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(jwksUri));
    jwksCache.set(jwksUri, jwks);
  }
  return jwks;
}

export async function verifyJwt(
  token: string,
  config: JwksConfig
): Promise<jose.JWTVerifyResult> {
  const jwks = await getJwks(config.jwksUri);
  return jose.jwtVerify(token, jwks, {
    issuer: config.issuer,
  });
}
```

**Usage:** Callers should use `verifyJwt()` for production. Keep `validateJwtFormat()` for testing/debugging with clear documentation that it does NOT verify signatures.

---

### H2 & H4: Token Refresh Race Condition

**Files:** `src/auth/tokens.ts`, `src/extensions/oauth-m2m.ts`

**Issue:** TOCTOU race between checking for existing refresh promise and creating new one.

**Solution:** Promise-based lock pattern (no new dependencies).

```typescript
class TokenRefresher {
  private locks = new Map<string, Promise<TokenResponse>>();

  async refresh(key: string, refreshFn: () => Promise<TokenResponse>): Promise<TokenResponse> {
    // Check for existing refresh operation
    const existing = this.locks.get(key);
    if (existing) {
      return existing;
    }

    // Create new refresh operation
    const promise = refreshFn().finally(() => {
      this.locks.delete(key);
    });

    this.locks.set(key, promise);
    return promise;
  }
}
```

**Apply to:**
1. `TokenManager.refreshToken()` in `tokens.ts`
2. `M2MAuthenticator.getToken()` in `oauth-m2m.ts`

---

### H3: Timing-Safe State Validation

**File:** `src/auth/oauth.ts`
**Location:** `validateState()` function

**Current:**
```typescript
export function validateState(received: string, expected: string): boolean {
  if (received.length !== expected.length) {
    return false;  // Early return leaks length info
  }
  // ...
}
```

**Fixed:**
```typescript
import { timingSafeEqual } from 'node:crypto';

export function validateState(received: string, expected: string): boolean {
  if (typeof received !== 'string' || typeof expected !== 'string') {
    return false;
  }

  // Pad shorter string to prevent length leakage
  const maxLen = Math.max(received.length, expected.length);
  const a = Buffer.alloc(maxLen, 0);
  const b = Buffer.alloc(maxLen, 0);

  Buffer.from(received).copy(a);
  Buffer.from(expected).copy(b);

  // Constant-time comparison
  return timingSafeEqual(a, b) && received.length === expected.length;
}
```

**Also apply to:** `src/auth/pkce.ts` `timingSafeCompare()` function.

---

### H5: Fail-Closed Cursor Secret

**File:** `src/protocol/pagination.ts`

**Current:**
```typescript
const CURSOR_SECRET = process.env['MCP_CURSOR_SECRET'] ?? 'mcp-pagination-secret';
```

**Fixed:**
```typescript
function getCursorSecret(): string {
  const secret = process.env['MCP_CURSOR_SECRET'];
  if (!secret) {
    throw new Error(
      'MCP_CURSOR_SECRET environment variable is required. ' +
      'Set a cryptographically random secret (minimum 32 characters).'
    );
  }
  if (secret.length < 32) {
    throw new Error('MCP_CURSOR_SECRET must be at least 32 characters.');
  }
  return secret;
}

// Call at module load to fail fast
const CURSOR_SECRET = getCursorSecret();
```

**Documentation:** Update `.env.example` with:
```bash
# Required: Cursor signing secret (min 32 chars)
# Generate with: openssl rand -base64 32
MCP_CURSOR_SECRET=
```

---

### H6: Event Listener Memory Leak in Tool Executor

**File:** `src/tools/executor.ts`
**Location:** `executeWithTimeout()` method (lines 476-492)

**Issue:** Event listeners added to `AbortSignal` for timeout and cancellation are never removed. In long-running servers, this causes memory accumulation.

**Current:**
```typescript
const result = await Promise.race([
  tool.handler(args),
  new Promise<ToolResult>((_, reject) => {
    timeoutController.signal.addEventListener('abort', () => {
      reject(new Error('Tool execution timeout'));
    });
  }),
  ...(context?.abortSignal
    ? [
        new Promise<ToolResult>((_, reject) => {
          context.abortSignal!.addEventListener('abort', () => {
            reject(new Error('Tool execution cancelled'));
          });
        }),
      ]
    : []),
]);
```

**Fixed:**
```typescript
const result = await Promise.race([
  tool.handler(args),
  new Promise<ToolResult>((_, reject) => {
    timeoutController.signal.addEventListener('abort', () => {
      reject(new Error('Tool execution timeout'));
    }, { once: true });
  }),
  ...(context?.abortSignal
    ? [
        new Promise<ToolResult>((_, reject) => {
          context.abortSignal!.addEventListener('abort', () => {
            reject(new Error('Tool execution cancelled'));
          }, { once: true });
        }),
      ]
    : []),
]);
```

**Rationale:** The `{ once: true }` option automatically removes the listener after it fires, preventing accumulation.

**Note:** The SSE buffer performance issue (using `array.shift()`) was identified in the review but will not be addressed in this phase per user decision - the current implementation is acceptable for typical buffer sizes.

---

### H7: Stdio Buffer Size Limit

**File:** `src/transport/stdio.ts`

**Location:** `handleData()` method

**Current:**
```typescript
private handleData(chunk: Buffer | string): void {
  const data = typeof chunk === 'string' ? chunk : chunk.toString(ENCODING);
  this.buffer += data;
  this.processBuffer();
}
```

**Fixed:**
```typescript
private static readonly MAX_LINE_LENGTH = 1024 * 1024; // 1MB

private handleData(chunk: Buffer | string): void {
  const data = typeof chunk === 'string' ? chunk : chunk.toString(ENCODING);
  this.buffer += data;

  // Check for DoS attack: line too long without newline
  if (this.buffer.length > StdioTransport.MAX_LINE_LENGTH && !this.buffer.includes('\n')) {
    const error = new Error(`Line exceeds maximum length of ${StdioTransport.MAX_LINE_LENGTH} bytes`);
    this.errorEmitter.emit('error', error);
    this.buffer = ''; // Clear to allow recovery
    return;
  }

  this.processBuffer();
}
```

---

### H8: Config Dependency Injection

**File:** `src/config.ts`

**Current:** Global singleton that loads from `process.env` directly. The file already has `resetConfig()` but `loadConfig()` doesn't accept an env parameter, making it hard to test with custom environment values.

**Current state:**
```typescript
export function loadConfig(): Config {
  const rawConfig = {
    port: parseInteger(process.env['MCP_PORT']),
    // ... uses process.env directly
  };
  // ...
}

export function resetConfig(): void {
  config = null;
}
```

**Fixed:** Add env parameter to `loadConfig()` and add `setConfig()` for direct injection:

```typescript
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const rawConfig = {
    port: parseInteger(env['MCP_PORT']),
    host: env['MCP_HOST'] || undefined,
    transport: env['MCP_TRANSPORT'] || undefined,
    // ... use env parameter instead of process.env throughout
  };
  // ... rest of validation
}

// For testing - allows injecting a complete config object
export function setConfig(newConfig: Config): void {
  config = newConfig;
}
```

**Usage pattern for tests:**
```typescript
beforeEach(() => {
  resetConfig();  // Already exists
});

test('custom env', () => {
  // Option 1: Use loadConfig with custom env
  const config = loadConfig({ MCP_PORT: '8080' });

  // Option 2: Inject complete config
  setConfig({ ...defaultConfig, port: 8080 });
});
```

---

### H9: Shell-Quote for CLI Parsing

**File:** `src/client/cli.ts`
**New dependency:** `shell-quote`

**Current:**
```typescript
if (server) {
  const parts = server.split(' ');
  const command = parts[0]!;
  const args = parts.slice(1);
  await mcpClient.connectStdio({ command, args });
}
```

**Fixed:**
```typescript
import { parse } from 'shell-quote';

if (server) {
  const parsed = parse(server);

  // Filter out operators and validate
  const parts = parsed.filter((p): p is string => typeof p === 'string');
  if (parts.length === 0) {
    throw new Error('Invalid server command');
  }

  const command = parts[0];
  const args = parts.slice(1);
  await mcpClient.connectStdio({ command, args });
}
```

**Handles:**
- `node "path with spaces/script.js"`
- `node 'single quoted path/script.js'`
- Escaped spaces: `node path\ with\ spaces/script.js`

---

### H10: Async Imports Only

**File:** `src/client/llm-provider.ts`

**Current:** Uses `require()` with eslint-disable comment.

**Fixed:** Convert all imports to async dynamic imports.

```typescript
// Remove sync version entirely
// Replace require() with dynamic import()

export async function createProvider(
  provider: ProviderType,
  config: ProviderConfig
): Promise<LanguageModel> {
  switch (provider) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model ?? 'claude-sonnet-4-20250514');
    }
    case 'openrouter': {
      const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
      const openrouter = createOpenRouter({ apiKey: config.apiKey || '' });
      return openrouter(config.model ?? 'anthropic/claude-sonnet-4');
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

**Remove:**
- `createProviderSync()` function
- All `require()` calls
- Related eslint-disable comments

---

## Testing Requirements

### Unit Tests

Each fix requires corresponding test coverage:

1. **HTTP body limit:** Test that requests > 100KB are rejected with 413
2. **JWT verification:** Test valid/invalid signatures, expired tokens, wrong issuer
3. **Token refresh mutex:** Test concurrent refresh returns same promise
4. **Timing-safe comparison:** Test equal/unequal strings return correct result
5. **Cursor secret:** Test missing/short secret throws at startup
6. **Event listener cleanup:** Test no listener accumulation after many operations
7. **Stdio buffer limit:** Test oversized line triggers error
8. **Config reset:** Test resetConfig() allows fresh configuration
9. **Shell parsing:** Test quoted paths, spaces, special characters

### Integration Tests

- Verify server starts with required environment variables
- Verify JWT verification integrates with token flow
- Verify CLI handles paths with spaces

---

## Migration Guide

### Breaking Changes

1. **MCP_CURSOR_SECRET required:** Server will not start without this env var
2. **createProviderSync() removed:** Use async `createProvider()` instead
3. **tracing.ts deleted:** Use `telemetry.ts` for tracing

### Upgrade Steps

1. Add new dependencies:
   ```bash
   npm install jose shell-quote
   npm install -D @types/shell-quote
   ```

2. Set required environment variables:
   ```bash
   export MCP_CURSOR_SECRET=$(openssl rand -base64 32)
   ```

3. Update any code using `createProviderSync()` to use async `createProvider()`

4. Remove any imports from `observability/tracing.ts`

---

## Open Questions

1. Should JWKS be cached with TTL, or rely on jose's built-in caching?
2. Should we add configurable body size limit or is 100KB sufficient?
3. Should cursor secret validation happen at config load or pagination module load?

---

## Future Work (Out of Scope)

The following medium/low severity issues are documented but not addressed in this specification:

- CORS origins should be configurable (MEDIUM)
- Telemetry default-enabled is privacy concern (MEDIUM)
- Protocol version negotiation (MEDIUM)
- Session limits (MEDIUM)
- Log rotation (LOW)
- Conversation history limits (LOW)

---

## Verification Checklist

Cross-reference with code review results to ensure all critical/high issues addressed:

| Issue | Source Review | Spec Section | Verified |
|-------|---------------|--------------|----------|
| HTTP body limit | 02-protocol-transport.md:209 | C1 | ✓ express.json at line 241 |
| Tracing stub | 04-server-client-observability.md:499 | C2 | ✓ file at src/observability/tracing.ts |
| JWT verification | 01-auth-security.md:88 | H1 | ✓ validateJwtFormat at tokens.ts:379 |
| Token refresh race | 01-auth-security.md:99 | H2 | ✓ refreshPromises at tokens.ts:543 |
| Timing attack | 01-auth-security.md:34 | H3 | ✓ validateState at oauth.ts:241 |
| M2M token race | 01-auth-security.md:242 | H4 | ✓ tokenPromise at oauth-m2m.ts:228 |
| Cursor secret | 02-protocol-transport.md:176 | H5 | ✓ CURSOR_SECRET at pagination.ts:85 |
| Event listener leak | 03-tools-extensions.md:46 | H6 | ✓ addEventListener at executor.ts:479 |
| Stdio buffer DoS | 02-protocol-transport.md:289 | H7 | ✓ handleData at stdio.ts:271 |
| Config singleton | 04-server-client-observability.md:133 | H8 | ✓ getConfig at config.ts:127 |
| CLI command injection | 04-server-client-observability.md:225 | H9 | ✓ server.split at cli.ts:80 |
| require() in ESM | 04-server-client-observability.md:355 | H10 | ✓ require at llm-provider.ts:74 |
