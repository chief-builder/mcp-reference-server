# End-to-End Testing Plan for MCP Reference Server

## Overview

Add comprehensive E2E tests that verify complete workflows across all transport types, ensuring the MCP reference server works correctly from client request to server response.

## Current State

### Existing Test Coverage
- **Unit Tests** (test/unit/): 30+ files covering isolated components
- **Integration Tests** (test/integration/): 6 files covering basic flows
  - `http.test.ts` - HTTP request/response cycles
  - `lifecycle.test.ts` - Protocol lifecycle
  - `tools.test.ts` - Tool discovery/execution
  - `sse.test.ts` - Server-Sent Events
  - `inspector.test.ts` - MCP Inspector compatibility
  - `oauth.test.ts` - OAuth flows

### Identified Gaps for E2E Testing
1. **Multi-transport scenarios** - No tests verifying stdio and HTTP work simultaneously
2. **Complete client-server flows** - Using the actual client SDK
3. **Session lifecycle** - Timeout, expiration, cleanup under load
4. **Graceful shutdown** - Mid-request shutdown, timeout enforcement
5. **Error path coverage** - Protocol version mismatch, capability negotiation failures
6. **Cross-transport consistency** - Same messages produce same results on all transports

## Proposed E2E Test Structure

```
test/
├── e2e/
│   ├── helpers/
│   │   ├── server-harness.ts    # Start/stop server with config
│   │   ├── client-factory.ts    # Create stdio/HTTP clients
│   │   └── assertions.ts        # E2E-specific matchers
│   ├── workflows/
│   │   ├── initialization.e2e.ts
│   │   ├── tool-execution.e2e.ts
│   │   ├── session-management.e2e.ts
│   │   └── shutdown.e2e.ts
│   ├── transports/
│   │   ├── http.e2e.ts
│   │   ├── stdio.e2e.ts
│   │   └── cross-transport.e2e.ts
│   └── scenarios/
│       ├── error-handling.e2e.ts
│       └── concurrent-requests.e2e.ts
```

## Implementation Chunks

### CHUNK-01: E2E Test Infrastructure
**Goal**: Create test harness for spawning real server processes

**Files**:
- `test/e2e/helpers/server-harness.ts` - Server process management
- `test/e2e/helpers/client-factory.ts` - Client creation utilities
- `test/e2e/helpers/assertions.ts` - E2E assertion helpers

**Done When**:
- Can spawn server as child process with custom config
- Can create stdio and HTTP clients that connect to server
- Server cleanly shuts down after tests
- Port allocation doesn't conflict with unit tests

### CHUNK-02: Initialization Workflow E2E
**Goal**: Test complete client-server handshake

**File**: `test/e2e/workflows/initialization.e2e.ts`

**Scenarios**:
1. HTTP client connects, initializes, receives capabilities
2. Stdio client connects, initializes, receives capabilities
3. Protocol version mismatch handling
4. Capability negotiation (client requests unsupported capability)
5. Multiple clients initialize concurrently

### CHUNK-03: Tool Execution E2E
**Goal**: Test tool discovery and execution flows

**File**: `test/e2e/workflows/tool-execution.e2e.ts`

**Scenarios**:
1. List tools with pagination
2. Execute calculator tool with valid input
3. Execute tool with invalid arguments (schema validation)
4. Execute tool that returns error
5. Tool execution timeout
6. Cancel tool execution via abort signal

### CHUNK-04: Session Management E2E
**Goal**: Test session lifecycle across requests

**File**: `test/e2e/workflows/session-management.e2e.ts`

**Scenarios**:
1. Session created on first request, reused on subsequent
2. Session expiration after TTL
3. Invalid session ID rejection
4. Concurrent requests on same session
5. Session cleanup doesn't affect other sessions

### CHUNK-05: Graceful Shutdown E2E
**Goal**: Test server shutdown behavior

**File**: `test/e2e/workflows/shutdown.e2e.ts`

**Scenarios**:
1. Clean shutdown with no in-flight requests
2. Shutdown waits for in-flight requests
3. Shutdown timeout forces termination
4. New requests rejected during shutdown
5. Cleanup handlers execute in order

### CHUNK-06: Cross-Transport Consistency E2E
**Goal**: Verify same behavior across transports

**File**: `test/e2e/transports/cross-transport.e2e.ts`

**Scenarios** (parametrized for stdio and HTTP):
1. Same initialize sequence produces same response
2. Same tool call produces same result
3. Same error conditions produce same error response
4. Session-based features work on HTTP, stateless on stdio

### CHUNK-07: Error Handling E2E
**Goal**: Test error paths end-to-end

**File**: `test/e2e/scenarios/error-handling.e2e.ts`

**Scenarios**:
1. Invalid JSON request
2. Unknown method call
3. Request before initialization
4. Request with wrong protocol version
5. Malformed JSON-RPC (missing id, wrong jsonrpc version)

## Key Implementation Details

### Server Harness Pattern
```typescript
// test/e2e/helpers/server-harness.ts
export class ServerHarness {
  private process: ChildProcess | null = null;

  async start(config: Partial<ServerConfig>): Promise<{ port: number }> {
    const port = await getAvailablePort();
    this.process = spawn('node', ['dist/cli.js'], {
      env: {
        ...process.env,
        MCP_TRANSPORT: 'http',
        MCP_PORT: String(port),
        ...envFromConfig(config),
      },
    });
    await this.waitForReady(port);
    return { port };
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      await this.waitForExit();
    }
  }
}
```

### Test Pattern
```typescript
// test/e2e/workflows/initialization.e2e.ts
describe('E2E: Initialization', () => {
  let server: ServerHarness;

  beforeAll(async () => {
    server = new ServerHarness();
    await server.start({ transport: 'http' });
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should complete full initialization handshake', async () => {
    const client = await createHttpClient(server.port);

    const initResponse = await client.initialize({
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'e2e-test', version: '1.0.0' },
    });

    expect(initResponse.protocolVersion).toBe('2025-11-25');
    expect(initResponse.capabilities).toBeDefined();

    await client.sendInitialized();

    // Verify ready state by calling tools/list
    const tools = await client.listTools();
    expect(tools.tools).toBeInstanceOf(Array);
  });
});
```

## Configuration

### Vitest Config Addition
```typescript
// vitest.config.ts - add e2e project
export default defineConfig({
  test: {
    projects: [
      {
        // Existing unit/integration tests
        include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
      },
      {
        // E2E tests (longer timeout, sequential)
        include: ['test/e2e/**/*.e2e.ts'],
        testTimeout: 30000,
        hookTimeout: 30000,
        pool: 'forks',
        poolOptions: { forks: { singleFork: true } }, // Sequential
      },
    ],
  },
});
```

### Package.json Scripts
```json
{
  "scripts": {
    "test:e2e": "vitest run --project e2e",
    "test:all": "vitest run"
  }
}
```

## Verification

After implementation:
1. `npm run build` - Ensure server builds
2. `npm run test:e2e` - All E2E tests pass
3. `npm test` - Existing tests still pass
4. Manual: Start server, connect with client, execute tools

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Port conflicts | Use dynamic port allocation with retry |
| Flaky tests from timing | Use waitFor patterns, not fixed delays |
| Slow test suite | Run E2E separately from unit tests |
| Process cleanup | afterAll hooks + process.on('exit') cleanup |

## Estimated Effort

| Chunk | Size | Dependencies |
|-------|------|--------------|
| CHUNK-01: Infrastructure | M | None |
| CHUNK-02: Initialization | S | CHUNK-01 |
| CHUNK-03: Tool Execution | S | CHUNK-01 |
| CHUNK-04: Session Management | M | CHUNK-01 |
| CHUNK-05: Graceful Shutdown | M | CHUNK-01 |
| CHUNK-06: Cross-Transport | M | CHUNK-01 |
| CHUNK-07: Error Handling | S | CHUNK-01 |

Total: ~7 chunks, infrastructure first, then parallel implementation possible.
