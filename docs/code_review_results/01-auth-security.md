# Code Review: Authentication & Security Domain

**Review Date:** 2026-01-18
**Files Reviewed:** 7
**Total Lines:** ~3,000

---

## Files Reviewed

| File | Lines | Description |
|------|-------|-------------|
| `src/auth/oauth.ts` | 766 | OAuth 2.1 Authorization Code flow with PKCE |
| `src/auth/tokens.ts` | 680 | Token storage, validation, refresh, introspection |
| `src/auth/scopes.ts` | 514 | MCP scope definitions and validation |
| `src/auth/discovery.ts` | 301 | OAuth metadata discovery (RFC 8414/9728) |
| `src/auth/pkce.ts` | 204 | PKCE implementation (RFC 7636) |
| `src/auth/m2m.ts` | 18 | M2M auth re-export |
| `src/extensions/oauth-m2m.ts` | 516 | Client Credentials flow |

---

## Executive Summary

The authentication implementation is generally well-structured with good OAuth 2.1 compliance. However, there are several security concerns that should be addressed, particularly around JWT verification, timing attacks, and race conditions in token refresh.

---

## Issues by File

### 1. `src/auth/oauth.ts`

#### HIGH - Timing Attack in State Validation (Lines 241-257)

```typescript
export function validateState(received: string, expected: string): boolean {
  if (typeof received !== 'string' || typeof expected !== 'string') {
    return false;
  }

  if (received.length !== expected.length) {
    return false;  // Early return leaks length information
  }
  // ...
}
```

**Issue:** The early return on length mismatch leaks timing information. An attacker could determine the expected state length through timing analysis.

**Recommendation:** Use constant-time comparison for the entire operation, including length check.

#### MEDIUM - No Token Response Body Error Handling (Lines 572-573)

```typescript
const responseBody = await response.json();
```

**Issue:** If the response body is not valid JSON, this throws an unhandled exception.

**Recommendation:** Wrap in try-catch with appropriate error handling.

#### MEDIUM - Client Secret in Request Body (Lines 503-505)

```typescript
if (this.config.clientSecret) {
  body.set('client_secret', this.config.clientSecret);
}
```

**Issue:** Client secret sent in request body is less secure than HTTP Basic authentication.

**Recommendation:** Prioritize `client_secret_basic` method.

#### LOW - Session Expiration Default

The 10-minute default is reasonable but should be documented that longer sessions increase CSRF attack window.

#### LOW - Missing Resource Validation (Lines 380-384)

Resource URLs are not validated beyond Zod's URL check. Malicious resource indicators could be used for SSRF attacks.

---

### 2. `src/auth/tokens.ts`

#### HIGH - No JWT Signature Verification (Lines 379-445)

```typescript
validateJwtFormat(token: string, options?: TokenValidationOptions): TokenPayload {
  // Note: This does NOT verify the signature. For production use,
  // signature verification should be done using the authorization
  // server's public keys.
```

**Issue:** Without signature verification, attackers could forge tokens with arbitrary claims.

**Recommendation:** Implement signature verification using `jose` library against authorization server's JWKS.

#### HIGH - Race Condition in Token Refresh (Lines 543-556)

```typescript
const existingPromise = this.refreshPromises.get(key);
if (existingPromise) {
  return existingPromise;
}

const refreshPromise = this.performRefresh(key, token);
this.refreshPromises.set(key, refreshPromise);
```

**Issue:** TOCTOU race condition between checking and setting the promise. Concurrent calls could start multiple refresh operations.

**Recommendation:** Use a proper async mutex/lock pattern.

#### MEDIUM - Introspection Credentials in Memory (Lines 476-481)

Base64 encoded credentials remain in memory after use.

**Recommendation:** Consider clearing sensitive data after use.

#### MEDIUM - Default 1-Hour Token Expiry

If the authorization server doesn't specify `expires_in`, the 1-hour default could cache tokens longer than intended.

#### LOW - Unsafe JSON Parsing (Lines 496-497)

Should handle JSON parse errors gracefully.

---

### 3. `src/auth/scopes.ts`

#### MEDIUM - Scope Injection via Tool Names (Lines 199-201)

```typescript
export function buildToolScope(toolName: string): string {
  return `${TOOL_SCOPE_PREFIX}${toolName}`;
}
```

**Issue:** No validation on tool names. A malicious tool name like `../admin` could lead to unexpected scope matching.

**Recommendation:** Validate tool names against a safe pattern (alphanumeric, underscore, hyphen).

#### LOW - No Scope String Sanitization (Lines 164-169)

Scope string is only split on whitespace. Special characters could cause issues in different contexts.

#### LOW - Missing Input Validation on Custom Method Scopes

Custom method scopes from configuration are not validated.

---

### 4. `src/auth/discovery.ts`

#### MEDIUM - Environment Variable Injection (Lines 122-132)

```typescript
const resourceUrl = process.env.MCP_RESOURCE_URL;
const authServersEnv = process.env.MCP_AUTH_SERVERS;
```

**Issue:** Environment variables used directly without URL validation could cause SSRF or header injection.

**Recommendation:** Add URL validation for environment-sourced values.

#### MEDIUM - Potential Header Injection (Lines 222-245)

```typescript
if (options.errorDescription) {
  parts.push(`error_description="${options.errorDescription}"`);
}
```

**Issue:** `errorDescription` inserted directly into header could enable header injection if it contains quotes or newlines.

**Recommendation:** Escape or reject special characters.

#### LOW - Caching Without Validation

1-hour cache could serve stale metadata. Consider adding `must-revalidate`.

---

### 5. `src/auth/pkce.ts`

#### MEDIUM - Modulo Bias in Code Verifier Generation (Lines 78-90)

```typescript
const charsetLength = PKCE_VERIFIER_CHARSET.length;  // 66 characters
const randomIndex = randomByte % charsetLength;  // 256 % 66 = bias
```

**Issue:** Using `% 66` on a byte (0-255) creates modulo bias. Characters at indices 0-57 are slightly more likely than indices 58-65.

**Recommendation:** Use rejection sampling or a library for unbiased random selection.

#### LOW - Timing-Safe Comparison Length Leak (Lines 172-186)

```typescript
if (a.length !== b.length) {
  return false;  // Early return leaks length
}
```

**Issue:** Same length-leak issue as in oauth.ts.

**Recommendation:** Use Node.js built-in `crypto.timingSafeEqual` after padding to equal lengths.

#### LOW - Synchronous Hash Computation

While fine for small inputs, could block event loop with very long verifiers.

---

### 6. `src/auth/m2m.ts`

#### LOW - Tight Coupling

Purely a re-export, creating unnecessary dependency chain. Consider consolidation.

---

### 7. `src/extensions/oauth-m2m.ts`

#### HIGH - Client Secret Logged in Error Handler (Lines 461-467)

```typescript
} catch (error) {
  const safeConfig = client.getConfig();
  console.error(
    `M2M OAuth initialization failed for client ${safeConfig.clientId}...`,
    error instanceof Error ? error.message : 'Unknown error'
  );
```

**Issue:** While `safeConfig` excludes the secret, OAuth error messages from providers may include credential hints.

**Recommendation:** Sanitize error messages before logging.

#### MEDIUM - Race Condition in Token Caching (Lines 228-238)

Same TOCTOU issue as in tokens.ts.

#### MEDIUM - Credentials Persisted in Memory

Base64-encoded credentials remain in string pool.

#### LOW - Extension Settings Expose Token Endpoint

Could aid attackers in identifying authorization server.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 4 |
| Medium | 9 |
| Low | 8 |

---

## Recommendations

### Immediate Actions

1. **Implement JWT signature verification** using `jose` library
2. **Fix timing-safe comparisons** using `crypto.timingSafeEqual` with length padding
3. **Add mutex/lock for token refresh** to prevent race conditions
4. **Fix modulo bias in PKCE** using rejection sampling

### Short-term

5. Sanitize header values to prevent injection
6. Validate environment-sourced URLs
7. Add tool name validation in scope building
8. Wrap JSON parsing in try-catch

### Code Quality

9. Document session expiration security implications
10. Consider consolidating m2m.ts re-export
