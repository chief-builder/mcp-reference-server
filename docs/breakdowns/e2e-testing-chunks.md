# E2E Testing - Implementation Chunks

**Spec**: `docs/specs/e2e-testing.md`
**Created**: 2026-01-18
**Approach**: Risk-first (Infrastructure first, then parallel test suites)
**Beads**: Integrated (use `/auto --label=e2e-testing` to implement)

## Progress

- [ ] Phase 1: Infrastructure (1 chunk)
- [ ] Phase 2: Test Suites (6 chunks, can run in parallel)

## Phase 1: Infrastructure

### [ ] CHUNK-01: E2E Test Infrastructure
**Goal**: Create test harness for spawning real server processes and connecting clients

**Done When**:
- [ ] `test/e2e/helpers/server-harness.ts` exports `ServerHarness` class
- [ ] `ServerHarness.start()` spawns server process and returns `{ port, pid }`
- [ ] `ServerHarness.stop()` sends SIGTERM and waits for process exit
- [ ] `test/e2e/helpers/client-factory.ts` exports `createHttpClient()` and `createStdioClientSpawned()`
- [ ] `createHttpClient(port)` returns client that can call `initialize()`, `listTools()`, `callTool()`
- [ ] `createStdioClientSpawned(command, args, env)` spawns server and returns client for stdio transport
- [ ] `test/e2e/helpers/assertions.ts` exports `waitForServerReady(port, timeout)`
- [ ] Basic smoke test in `test/e2e/smoke.e2e.ts` passes: start server, connect client, list tools, stop server
- [ ] `vitest.config.ts` updated with e2e project config (30s timeout, sequential execution)
- [ ] `package.json` has `test:e2e` script
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads

**Scope**: `test/e2e/helpers/`, `vitest.config.ts`, `package.json`
**Size**: L
**Risk**: Medium - process management and port allocation may have platform-specific issues
**Beads**: #MCP_11252025_Reference-bdt

---

## Phase 2: Test Suites

### [ ] CHUNK-02: Initialization Workflow E2E Tests
**Goal**: Test complete client-server handshake for both transports

**Done When**:
- [ ] `test/e2e/workflows/initialization.e2e.ts` exists with 5+ test cases
- [ ] Test: HTTP client connects, initializes, receives `protocolVersion` and `capabilities`
- [ ] Test: Stdio client connects, initializes, receives `protocolVersion` and `capabilities`
- [ ] Test: Protocol version mismatch returns error (code `-32600` INVALID_REQUEST)
- [ ] Test: Client can call `tools/list` after successful initialization
- [ ] Test: Multiple clients initialize concurrently without interference
- [ ] All tests in `initialization.e2e.ts` pass
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: `test/e2e/workflows/initialization.e2e.ts`
**Size**: M
**Risk**: None
**Beads**: #MCP_11252025_Reference-0oz

---

### [ ] CHUNK-03: Tool Execution E2E Tests
**Goal**: Test tool discovery and execution flows end-to-end

**Done When**:
- [ ] `test/e2e/workflows/tool-execution.e2e.ts` exists with 5+ test cases
- [ ] Test: `tools/list` returns array of tool definitions with `name`, `description`, `inputSchema`
- [ ] Test: `tools/call` with valid input returns `content` array
- [ ] Test: `tools/call` with invalid arguments returns error with code `-32602`
- [ ] Test: `tools/call` for unknown tool returns error with code `-32601`
- [ ] Test: Tool execution respects timeout (if server supports it)
- [ ] All tests in `tool-execution.e2e.ts` pass
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: `test/e2e/workflows/tool-execution.e2e.ts`
**Size**: M
**Risk**: None
**Beads**: #MCP_11252025_Reference-0dn

---

### [ ] CHUNK-04: Session Management E2E Tests
**Goal**: Test HTTP session lifecycle across requests

**Done When**:
- [ ] `test/e2e/workflows/session-management.e2e.ts` exists with 5+ test cases
- [ ] Test: First request creates session, response includes `Mcp-Session-Id` header
- [ ] Test: Subsequent requests with same session ID reuse session state
- [ ] Test: Request with invalid session ID returns `404` or appropriate error
- [ ] Test: Multiple concurrent requests on same session don't corrupt state
- [ ] Test: Stdio transport works without session management (stateless)
- [ ] All tests in `session-management.e2e.ts` pass
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: `test/e2e/workflows/session-management.e2e.ts`
**Size**: M
**Risk**: None
**Beads**: #MCP_11252025_Reference-npe

---

### [ ] CHUNK-05: Graceful Shutdown E2E Tests
**Goal**: Test server shutdown behavior under various conditions

**Done When**:
- [ ] `test/e2e/workflows/shutdown.e2e.ts` exists with 4+ test cases
- [ ] Test: SIGTERM with no in-flight requests causes clean exit (code 0)
- [ ] Test: SIGTERM during in-flight request waits for completion before exit
- [ ] Test: New requests during shutdown receive `503 Service Unavailable` or connection refused
- [ ] Test: SIGKILL forces immediate termination
- [ ] All tests in `shutdown.e2e.ts` pass
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: `test/e2e/workflows/shutdown.e2e.ts`
**Size**: M
**Risk**: Medium - timing-sensitive tests may be flaky
**Beads**: #MCP_11252025_Reference-pw4

---

### [ ] CHUNK-06: Cross-Transport Consistency E2E Tests
**Goal**: Verify identical behavior across HTTP and stdio transports

**Done When**:
- [ ] `test/e2e/transports/cross-transport.e2e.ts` exists with parametrized tests
- [ ] Test: Same `initialize` request produces equivalent response on both transports
- [ ] Test: Same `tools/list` request produces identical tool list on both transports
- [ ] Test: Same `tools/call` request produces identical result on both transports
- [ ] Test: Same invalid request produces equivalent error on both transports
- [ ] All tests in `cross-transport.e2e.ts` pass
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: `test/e2e/transports/cross-transport.e2e.ts`
**Size**: M
**Risk**: None
**Beads**: #MCP_11252025_Reference-u0l

---

### [ ] CHUNK-07: Error Handling E2E Tests
**Goal**: Test error paths and edge cases end-to-end

**Done When**:
- [ ] `test/e2e/scenarios/error-handling.e2e.ts` exists with 5+ test cases
- [ ] Test: Invalid JSON body returns parse error with code `-32700`
- [ ] Test: Unknown method returns method not found error with code `-32601`
- [ ] Test: Request before initialization returns error (not crash)
- [ ] Test: Malformed JSON-RPC (missing `jsonrpc` field) returns invalid request error `-32600`
- [ ] Test: Malformed JSON-RPC (missing `id` for request) returns invalid request error `-32600`
- [ ] All tests in `error-handling.e2e.ts` pass
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: `test/e2e/scenarios/error-handling.e2e.ts`
**Size**: S
**Risk**: None
**Beads**: #MCP_11252025_Reference-2sp

---

## Discovered During Implementation

_(Issues found during implementation will be tracked here)_

## Notes

- E2E tests spawn real server processes - ensure `npm run build` runs before `npm run test:e2e`
- Port allocation uses dynamic ports (49152-65535) to avoid conflicts
- Tests use vitest's `singleFork` mode to run sequentially and avoid port conflicts
- Existing integration tests in `test/integration/` use different patterns (in-process transport testing)
