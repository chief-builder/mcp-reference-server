# Code Review Fixes - Implementation Chunks

**Spec**: `docs/specs/code-review-fixes.md`
**Created**: 2026-01-18
**Approach**: Risk-first (Critical issues first, then High severity)
**Beads**: Integrated (use /auto to implement)

## Progress

- [ ] Phase 1: Critical Security & Dead Code (2 chunks)
- [ ] Phase 2: Auth Security Hardening (3 chunks)
- [ ] Phase 3: Transport & DoS Protection (2 chunks)
- [ ] Phase 4: Client & Config Improvements (2 chunks)

---

## Phase 1: Critical Security & Dead Code

### [ ] CHUNK-01: HTTP Body Size Limit (C1)
**Goal**: Prevent memory exhaustion DoS by limiting JSON-RPC request body size

**Done When**:
- [ ] `express.json({ limit: '100kb' })` set in `src/transport/http.ts` setupMiddleware()
- [ ] Requests > 100KB return HTTP 413 (Payload Too Large)
- [ ] Validation passes (typecheck, lint, build)
- [ ] Unit test: verify 413 response for oversized payloads
- [ ] Discovered issues filed to beads

**Scope**: `src/transport/http.ts`
**Size**: S
**Risk**: None
**Beads**: #tda

---

### [ ] CHUNK-02: Delete Tracing Stub (C2) + Remove Export
**Goal**: Remove dead code that causes confusion; complete telemetry.ts is the real implementation

**Done When**:
- [ ] `src/observability/tracing.ts` file deleted
- [ ] Export line `export * from './observability/tracing.js';` removed from `src/index.ts`
- [ ] No imports of tracing.ts remain in codebase (grep returns 0 results)
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads

**Scope**: `src/observability/tracing.ts`, `src/index.ts`
**Size**: S
**Risk**: None - file is dead code with only stubs
**Beads**: #xnl

---

## Phase 2: Auth Security Hardening

### [ ] CHUNK-03: JWT Signature Verification (H1)
**Goal**: Add proper JWT signature verification using JWKS for production security

**Done When**:
- [ ] `jose` package added to dependencies in package.json
- [ ] `verifyJwt()` function exported from `src/auth/tokens.ts`
- [ ] JWKS remote keyset fetched from configurable jwksUri
- [ ] JWKS cache implemented (Map-based, no TTL needed - jose handles refresh)
- [ ] `validateJwtFormat()` docstring updated to warn it does NOT verify signatures
- [ ] Validation passes (typecheck, lint, build)
- [ ] Unit tests for: valid signature, invalid signature, expired token, wrong issuer
- [ ] Discovered issues filed to beads

**Scope**: `src/auth/tokens.ts`, `package.json`
**Size**: M
**Risk**: New dependency (jose) - well-maintained, recommended library
**Beads**: #ini

---

### [ ] CHUNK-04: Token Refresh Race Condition Fix (H2 + H4)
**Goal**: Fix TOCTOU race in token refresh using promise-based lock pattern

**Done When**:
- [ ] `TokenRefresher` class added to `src/auth/tokens.ts` with promise-lock pattern
- [ ] `TokenManager.refreshTokenIfPossible()` uses TokenRefresher (replaces inline lock)
- [ ] `M2MAuthenticator.getAccessToken()` uses same lock pattern in `src/extensions/oauth-m2m.ts`
- [ ] Concurrent refresh requests return same promise (no duplicate network calls)
- [ ] Validation passes (typecheck, lint, build)
- [ ] Unit test: concurrent refresh returns same token instance
- [ ] Discovered issues filed to beads

**Scope**: `src/auth/tokens.ts`, `src/extensions/oauth-m2m.ts`
**Size**: M
**Risk**: Race condition fix - must verify no regression in token flow
**Beads**: #6ft

---

### [ ] CHUNK-05: Timing-Safe State Validation (H3)
**Goal**: Prevent timing attacks in OAuth state validation using constant-time comparison

**Done When**:
- [ ] `validateState()` in `src/auth/oauth.ts` uses `timingSafeEqual` from `node:crypto`
- [ ] `timingSafeEqual()` in `src/auth/pkce.ts` also updated to use `node:crypto` timingSafeEqual
- [ ] Strings padded to same length before comparison (prevents length-based leakage)
- [ ] Returns correct result for equal and unequal strings of any length
- [ ] Validation passes (typecheck, lint, build)
- [ ] Unit tests for: equal strings, unequal strings, different lengths
- [ ] Discovered issues filed to beads

**Scope**: `src/auth/oauth.ts`, `src/auth/pkce.ts`
**Size**: S
**Risk**: None - uses built-in Node.js crypto
**Beads**: #7rn

---

## Phase 3: Transport & DoS Protection

### [ ] CHUNK-06: Fail-Closed Cursor Secret (H5) + Event Listener Leak (H6)
**Goal**: Require cursor secret at startup; fix event listener accumulation

**Done When**:
- [ ] `getCursorSecret()` function throws if `MCP_CURSOR_SECRET` not set or < 32 chars
- [ ] Secret validation happens at module load (fail-fast)
- [ ] `.env.example` updated with `MCP_CURSOR_SECRET=` entry and generation instructions
- [ ] `{ once: true }` added to both addEventListener calls in `src/tools/executor.ts:479-489`
- [ ] No listener accumulation after many tool executions
- [ ] Validation passes (typecheck, lint, build)
- [ ] Unit tests: missing secret throws, short secret throws, listener cleanup
- [ ] Discovered issues filed to beads

**Scope**: `src/protocol/pagination.ts`, `src/tools/executor.ts`, `.env.example`
**Size**: M
**Risk**: **Breaking change** - MCP_CURSOR_SECRET now required
**Beads**: #g3u

---

### [ ] CHUNK-07: Stdio Buffer Size Limit (H7)
**Goal**: Prevent DoS via unbounded line accumulation in stdio transport

**Done When**:
- [ ] `MAX_LINE_LENGTH` constant (1MB) added to `StdioTransport` class
- [ ] `handleData()` checks buffer length before newline found
- [ ] Oversized line emits error and clears buffer (allows recovery)
- [ ] Validation passes (typecheck, lint, build)
- [ ] Unit test: line > 1MB triggers error event
- [ ] Discovered issues filed to beads

**Scope**: `src/transport/stdio.ts`
**Size**: S
**Risk**: None
**Beads**: #0gh

---

## Phase 4: Client & Config Improvements

### [ ] CHUNK-08: Config Dependency Injection (H8)
**Goal**: Enable proper testing by allowing env injection into loadConfig()

**Done When**:
- [ ] `loadConfig()` accepts optional `env` parameter, defaults to `process.env`
- [ ] All `process.env` references in loadConfig replaced with `env` parameter
- [ ] `setConfig()` function exported for direct config injection in tests
- [ ] Validation passes (typecheck, lint, build)
- [ ] Unit test: loadConfig with custom env object works correctly
- [ ] Discovered issues filed to beads

**Scope**: `src/config.ts`
**Size**: S
**Risk**: None - additive change, backward compatible
**Beads**: #4u6

---

### [ ] CHUNK-09: CLI Shell Parsing + Async Imports (H9 + H10)
**Goal**: Fix command injection via shell-quote; remove sync require() calls

**Done When**:
- [ ] `shell-quote` and `@types/shell-quote` added to package.json
- [ ] ALL 3 `server.split(' ')` calls replaced with shell-quote `parse()`:
  - `runChatMode()` at line ~80
  - `listTools()` at line ~221
  - `callTool()` at line ~271
- [ ] Quoted paths handled correctly: `"path with spaces"`, `'single quoted'`
- [ ] `createLLMProvider()` (sync) removed from `src/client/llm-provider.ts`
- [ ] `createAnthropicProvider()` (sync with require) removed
- [ ] Only `createLLMProviderAsync()` remains for all provider creation
- [ ] All eslint-disable comments for require removed
- [ ] CLI updated to use async provider creation (already does)
- [ ] Validation passes (typecheck, lint, build)
- [ ] Unit tests: quoted paths parse correctly, special characters handled
- [ ] Discovered issues filed to beads

**Scope**: `src/client/cli.ts`, `src/client/llm-provider.ts`, `package.json`
**Size**: M
**Risk**: **Breaking change** - createProviderSync() removed
**Beads**: #uw4

---

## Discovered During Implementation

- [ ] [description] - found while working on [chunk]

## Notes

**Dependency order:**
- Phase 1 chunks have no dependencies (can run in parallel)
- Phase 2 chunks have no dependencies on each other (can run in parallel)
- Phase 3 and 4 chunks have no dependencies on Phase 2

**Breaking changes summary:**
- `MCP_CURSOR_SECRET` environment variable now required (CHUNK-06)
- `createProviderSync()` removed - use async `createProvider()` (CHUNK-09)
- `tracing.ts` deleted - use `telemetry.ts` (CHUNK-02)

**New dependencies:**
- `jose` ^5.0.0 (JWT verification)
- `shell-quote` ^1.8.0 (CLI parsing)
- `@types/shell-quote` ^1.7.0 (dev dependency)
