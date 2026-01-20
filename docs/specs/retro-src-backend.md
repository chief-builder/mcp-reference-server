# src/ (Backend) - Retroactive Specification

**Generated**: 2026-01-20
**Source**: `/Users/chiefbuilder/Documents/Projects/MCP_11252025_Reference/src`
**Type**: Retroactive (documents existing behavior)

## Overview

A production-ready MCP (Model Context Protocol) server implementation in TypeScript. Provides JSON-RPC 2.0 communication over stdio and HTTP/SSE transports, with OAuth 2.1/PKCE authentication, tool registration/execution, and an AI agent client that orchestrates LLM interactions with MCP tools.

## Architecture

### Module Structure

```
src/
├── api/              # REST API layer
│   ├── router.ts     # Express router setup
│   ├── chat-handler.ts    # SSE streaming chat
│   ├── cancel-handler.ts  # Request cancellation
│   ├── oauth-router.ts    # OAuth endpoints
│   └── jwt-issuer.ts      # JWT token issuance
├── auth/             # Authentication
│   ├── oauth.ts      # OAuth 2.1 client
│   ├── pkce.ts       # PKCE implementation
│   ├── tokens.ts     # JWT verification
│   ├── m2m.ts        # Machine-to-machine auth
│   ├── discovery.ts  # OIDC discovery
│   └── scopes.ts     # Scope validation
├── client/           # MCP Client + Agent
│   ├── mcp-client.ts # MCP protocol client
│   ├── agent.ts      # AI agent orchestration
│   ├── cli.ts        # Client CLI
│   ├── llm-provider.ts    # LLM provider factory
│   └── tools-adapter.ts   # MCP→AI SDK adapter
├── completions/      # Auto-completion
│   └── handler.ts    # Completion handler
├── extensions/       # Extension framework
│   └── framework.ts  # Plugin system
├── logging/          # Logging
│   └── handler.ts    # Log level handler
├── observability/    # Telemetry
│   ├── telemetry.ts  # OpenTelemetry setup
│   ├── metrics.ts    # Metrics collection
│   ├── health.ts     # Health checks
│   └── logger.ts     # Structured logging
├── protocol/         # MCP Protocol
│   ├── jsonrpc.ts    # JSON-RPC 2.0 impl
│   ├── lifecycle.ts  # Server state machine
│   ├── errors.ts     # Error types
│   ├── pagination.ts # Cursor pagination
│   └── capabilities.ts    # Capability negotiation
├── tools/            # Tool System
│   ├── registry.ts   # Tool registration
│   ├── executor.ts   # Tool execution
│   ├── builtin.ts    # Built-in tools
│   ├── calculator.ts # Calculator tool
│   ├── dice-roller.ts     # Dice roller tool
│   └── fortune-teller.ts  # Fortune tool
├── transport/        # Transport Layer
│   ├── stdio.ts      # Stdio transport
│   ├── http.ts       # HTTP transport
│   └── sse.ts        # SSE manager
├── cli.ts            # Server CLI entry
├── config.ts         # Configuration
├── message-router.ts # Message routing
├── server.ts         # MCPServer class
└── index.ts          # Public exports
```

## Public Interface

### Main Exports (index.ts)

| Export | Type | Description |
|--------|------|-------------|
| `MCPServer` | Class | Main server orchestrator |
| `createServer` | Function | Server factory |
| `ToolRegistry` | Class | Tool registration |
| `StdioTransport` | Class | Stdio transport |
| `HttpTransport` | Class | HTTP transport |
| `LifecycleManager` | Class | Protocol lifecycle |
| `MessageRouter` | Class | Request routing |
| `loadConfig` | Function | Environment config loader |

### CLI Entry Points

| Command | File | Description |
|---------|------|-------------|
| `mcp-reference-server` | `cli.ts` | Start MCP server |
| `mcp-client` | `client/cli.ts` | Client CLI (chat, tools, call) |

## Behavior

### Core Functionality

#### 1. Server Lifecycle (`protocol/lifecycle.ts`)

- **States**: `uninitialized` → `initializing` → `ready` → `shutting_down`
- **Flow**:
  1. Server starts in `uninitialized` state
  2. Client sends `initialize` request with protocol version
  3. Server validates version (`2025-11-25`), transitions to `initializing`
  4. Server responds with capabilities
  5. Client sends `notifications/initialized`
  6. Server transitions to `ready`, accepts all requests

- **Pre-initialization rejection**: Requests before `ready` return error (except `initialize`)

#### 2. Message Routing (`message-router.ts`)

- **Input**: JSON-RPC request or notification
- **Flow**:
  1. Check lifecycle state (reject if not ready)
  2. Extract method name
  3. Route to handler:
     - `initialize` → LifecycleManager
     - `tools/list` → ToolRegistry
     - `tools/call` → ToolExecutor
     - `completion/complete` → CompletionHandler
     - `logging/setLevel` → LoggingHandler
     - `ping` → Return empty result

#### 3. Transport Layer

**Stdio (`transport/stdio.ts`)**:
- NDJSON framing (newline-delimited JSON)
- Reads from stdin, writes to stdout
- Logs to stderr
- Signal handling (SIGTERM/SIGINT)
- Max line length: 1MB

**HTTP (`transport/http.ts`)**:
- Express-based HTTP server
- POST `/mcp` for JSON-RPC
- Session management via `mcp-session-id` header
- Protocol version header: `mcp-protocol-version`
- CORS support
- Graceful shutdown with connection draining

**SSE (`transport/sse.ts`)**:
- Server-Sent Events for streaming responses
- Event types: `token`, `tool_call`, `tool_result`, `done`, `error`
- Connection keep-alive

#### 4. Tool System (`tools/`)

**ToolRegistry**:
- Name validation: `^[a-z][a-z0-9_]*$`
- Paginated listing (default: 50, max: 200)
- `toolsChanged` event emission
- JSON Schema validation for inputSchema

**ToolExecutor**:
- Input validation against schema
- Timeout support
- Error wrapping

**Built-in Tools**:
| Tool | Description |
|------|-------------|
| `calculate` | Arithmetic (add, subtract, multiply, divide) |
| `roll_dice` | Dice notation (e.g., "2d6+5") |
| `tell_fortune` | Fortune generation by category/mood |

#### 5. Authentication (`auth/`)

**OAuth 2.1 Client**:
- Authorization Code flow with PKCE (S256)
- State parameter for CSRF protection
- Token exchange and refresh
- Auth0-compatible endpoints

**Token Verification**:
- JWT validation with JWKS
- Audience/issuer validation
- Scope checking

**M2M Auth**:
- Client credentials grant
- Service-to-service authentication

#### 6. Client & Agent (`client/`)

**MCPClient**:
- Connect via stdio (subprocess) or HTTP
- Send JSON-RPC requests
- List and call tools

**Agent**:
- Stateful conversation history
- LLM integration via Vercel AI SDK
- Automatic tool calling (maxSteps configurable)
- Supports OpenRouter and Anthropic providers

### Error Handling

| Code | Error | Condition |
|------|-------|-----------|
| -32700 | Parse Error | Invalid JSON |
| -32600 | Invalid Request | Missing jsonrpc/method |
| -32601 | Method Not Found | Unknown method |
| -32602 | Invalid Params | Schema validation failure |
| -32603 | Internal Error | Server-side exception |
| -32001 | Tool Not Found | Unknown tool name |
| -32002 | Tool Execution Error | Handler threw |

### Configuration

| Env Variable | Default | Description |
|--------------|---------|-------------|
| `MCP_PORT` | 3000 | HTTP server port |
| `MCP_HOST` | 0.0.0.0 | HTTP bind address |
| `MCP_TRANSPORT` | both | stdio, http, or both |
| `MCP_STATELESS_MODE` | false | Disable sessions |
| `MCP_PAGINATION_DEFAULT` | 50 | Default page size |
| `MCP_PAGINATION_MAX` | 200 | Max page size |
| `MCP_REQUEST_TIMEOUT_MS` | 60000 | Request timeout |
| `MCP_SHUTDOWN_TIMEOUT_MS` | 30000 | Shutdown timeout |
| `MCP_LOG_LEVEL` | info | Log level |
| `MCP_DEBUG` | false | Debug mode |
| `OPENROUTER_API_KEY` | - | OpenRouter API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |

## Dependencies

### Production

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | Official MCP SDK types |
| `express` | HTTP server |
| `zod` | Runtime validation |
| `jose` | JWT/JWKS handling |
| `ai` | Vercel AI SDK |
| `@openrouter/ai-sdk-provider` | OpenRouter integration |
| `commander` | CLI parsing |
| `chalk` | Terminal colors |

### Development

| Package | Purpose |
|---------|---------|
| `vitest` | Test framework |
| `typescript` | Type system |
| `tsx` | TS execution |
| `@opentelemetry/*` | Observability |
| `eslint` | Linting |

## Integration Points

### MCP Protocol Methods

| Method | Type | Description |
|--------|------|-------------|
| `initialize` | Request | Protocol handshake |
| `notifications/initialized` | Notification | Complete handshake |
| `tools/list` | Request | List available tools |
| `tools/call` | Request | Execute a tool |
| `completion/complete` | Request | Argument completion |
| `logging/setLevel` | Request | Set log level |
| `ping` | Request | Health check |

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | JSON-RPC endpoint |
| `/api/chat` | POST | SSE streaming chat |
| `/api/cancel` | POST | Cancel generation |
| `/api/health` | GET | Health check |
| `/oauth/authorize` | GET | OAuth authorization |
| `/oauth/token` | POST | Token exchange |
| `/oauth/callback` | GET | OAuth callback |

## Test Coverage

**Test Framework**: Vitest 2.0
**Total Files**: 60 test files
**Tests**: 2047 unit/integration + 91 E2E

### Test Structure

```
test/
├── unit/           # Unit tests (mirrors src/)
│   ├── api/        # API handler tests
│   ├── auth/       # Auth tests (6 files)
│   ├── client/     # Client tests
│   ├── completions/
│   ├── extensions/
│   ├── logging/
│   ├── observability/
│   ├── protocol/   # JSON-RPC, lifecycle tests
│   ├── tools/      # Tool tests
│   └── transport/  # Transport tests
├── integration/    # Integration tests
├── e2e/            # End-to-end tests
│   ├── agent.e2e.ts
│   ├── oauth-flow.e2e.ts
│   ├── smoke.e2e.ts
│   ├── scenarios/
│   ├── transports/
│   └── workflows/
└── helpers/        # Test utilities
```

### Coverage by Module

| Module | Test Coverage |
|--------|---------------|
| protocol/ | ✅ Comprehensive |
| transport/ | ✅ Comprehensive |
| auth/ | ✅ Comprehensive (6 test files) |
| tools/ | ✅ Comprehensive |
| api/ | ✅ Covered |
| client/ | ✅ Covered |
| observability/ | ✅ Covered |

## Observations

### Patterns Used

- **State machine**: LifecycleManager for protocol state
- **Registry pattern**: ToolRegistry with event emission
- **Factory pattern**: `createServer()`, `createStdioTransport()`
- **Middleware chain**: Express middleware for auth, CORS
- **Singleton**: Config singleton with `getConfig()`
- **Adapter pattern**: `tools-adapter.ts` converts MCP→AI SDK tools

### Technical Debt

- Legacy exports marked `@deprecated` in lifecycle.ts, oauth.ts
- `zodToJsonSchema()` is simplified - consider using zod-to-json-schema library
- Some async handlers don't return promises consistently

### Strengths

- Comprehensive test coverage (2047+ tests)
- Clean separation of concerns (protocol/transport/tools)
- Graceful shutdown handling
- OpenTelemetry instrumentation built-in
- Stateless mode for horizontal scaling
- Well-documented code with JSDoc

### Potential Improvements

- Add request tracing across subsystems
- Consider connection pooling for HTTP transport
- Add rate limiting middleware
- Implement tool timeout configuration per-tool
- Add metrics dashboards/Grafana templates

## Open Questions

- Should the server support batch JSON-RPC requests?
- Is the 1MB line length limit sufficient for all use cases?
- Should tool handlers support streaming results?
- How should the server handle version negotiation with older clients?
- Should session storage be pluggable (Redis, etc.)?
