# MCP Reference Server - Implementation Specification

## Overview

### Purpose
Build a production-quality reference implementation of an MCP (Model Context Protocol) server targeting the 2025-11-25 specification. This server demonstrates all Phase 1 capabilities including JSON-RPC 2.0 messaging, dual transport support (stdio + Streamable HTTP), OAuth 2.1 with PKCE, and a complete extensions framework.

### Goals
- Serve as a canonical reference for MCP server implementers
- Demonstrate all Phase 1 protocol features with working code
- Provide comprehensive test coverage and MCP Inspector compatibility
- Package as a reusable npm module

### Technology Stack
| Component | Choice |
|-----------|--------|
| Language | TypeScript |
| Runtime | Node.js 20 LTS (minimum) |
| MCP SDK | `@modelcontextprotocol/sdk` (official) |
| Telemetry | OpenTelemetry (traces, metrics, logs) |
| Package | npm module |
| Config | Environment variables (12-factor) |

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                     MCP Reference Server                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   stdio     │  │ Streamable  │  │    OAuth 2.1 Module     │ │
│  │  Transport  │  │    HTTP     │  │  (PKCE + M2M + Auth0)   │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  Protocol Handler                          │ │
│  │  - JSON-RPC 2.0 parsing/serialization                     │ │
│  │  - Lifecycle management (init → operate → shutdown)       │ │
│  │  - Capability negotiation                                  │ │
│  │  - Request routing                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                          │                                      │
│         ┌────────────────┼────────────────┐                    │
│         ▼                ▼                ▼                    │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐              │
│  │   Tools   │    │ Logging   │    │Completions│              │
│  │  Registry │    │  Handler  │    │  Handler  │              │
│  └───────────┘    └───────────┘    └───────────┘              │
│         │                                                       │
│         ▼                                                       │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    Tool Implementations                    │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐  │ │
│  │  │Calculator│  │ Dice Roller  │  │  Fortune Teller     │  │ │
│  │  └──────────┘  └──────────────┘  └─────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                          │                                      │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Observability (OpenTelemetry)                 │ │
│  │  - Structured logging (JSON)                               │ │
│  │  - Distributed tracing (OTLP export)                       │ │
│  │  - Metrics (request count, latency, errors)               │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
mcp-reference-server/
├── src/
│   ├── index.ts                 # Entry point, exports
│   ├── server.ts                # Main server class
│   ├── config.ts                # Environment config loader
│   │
│   ├── protocol/
│   │   ├── jsonrpc.ts           # JSON-RPC 2.0 types & parsing
│   │   ├── lifecycle.ts         # Initialize/shutdown handling
│   │   ├── capabilities.ts      # Capability negotiation
│   │   └── errors.ts            # Standard error codes
│   │
│   ├── transport/
│   │   ├── stdio.ts             # stdio transport
│   │   ├── http.ts              # Streamable HTTP transport
│   │   ├── session.ts           # Session management
│   │   └── sse.ts               # SSE stream with replay
│   │
│   ├── auth/
│   │   ├── oauth.ts             # OAuth 2.1 core
│   │   ├── pkce.ts              # PKCE implementation
│   │   ├── discovery.ts         # Metadata endpoints
│   │   ├── tokens.ts            # Token validation/refresh
│   │   └── m2m.ts               # M2M extension
│   │
│   ├── tools/
│   │   ├── registry.ts          # Tool registration & lookup
│   │   ├── executor.ts          # Tool execution with validation
│   │   ├── calculator.ts        # Calculator tool
│   │   ├── dice-roller.ts       # Dice roller tool
│   │   └── fortune-teller.ts    # Fortune teller tool
│   │
│   ├── completions/
│   │   └── handler.ts           # Argument auto-complete
│   │
│   ├── logging/
│   │   └── handler.ts           # Log level management
│   │
│   ├── extensions/
│   │   ├── framework.ts         # Extension negotiation
│   │   └── oauth-m2m.ts         # M2M OAuth extension impl
│   │
│   └── observability/
│       ├── telemetry.ts         # OpenTelemetry setup
│       ├── metrics.ts           # Custom metrics
│       ├── tracing.ts           # Trace propagation
│       └── health.ts            # Health endpoints
│
├── test/
│   ├── unit/
│   │   ├── protocol/            # Protocol unit tests
│   │   ├── tools/               # Tool unit tests
│   │   └── auth/                # Auth unit tests
│   │
│   └── integration/
│       ├── stdio.test.ts        # stdio transport tests
│       ├── http.test.ts         # HTTP transport tests
│       ├── oauth.test.ts        # OAuth flow tests
│       └── inspector.test.ts    # MCP Inspector compatibility
│
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## P0: Core Protocol Implementation

### JSON-RPC 2.0 Foundation

#### Message Types

```typescript
// Request (expects response)
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

// Response (result or error)
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

// Notification (no response)
interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  // NO id field
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}
```

#### Message ID Handling
- IDs MUST be unique within a session
- Server echoes exact ID in response
- Track pending request IDs to prevent duplicates
- Support both string and integer IDs

#### JSON Schema Dialect
All `inputSchema` and `outputSchema` use JSON Schema 2020-12 as default dialect (SEP-1613).

### Lifecycle Management

#### Initialization Sequence

```
Client                          Server
  │                               │
  │─── initialize ───────────────▶│
  │    {protocolVersion,          │
  │     capabilities,             │
  │     clientInfo}               │
  │                               │
  │◀── InitializeResult ─────────│
  │    {protocolVersion,          │
  │     capabilities,             │
  │     serverInfo,               │
  │     instructions?}            │
  │                               │
  │─── initialized ──────────────▶│
  │    (notification)             │
  │                               │
  │       [Operation Phase]       │
  │                               │
```

#### Pre-initialization Rejection
- Server MUST reject all requests before `initialized` notification
- Return error code `-32600` (Invalid Request) with message indicating server not initialized

#### Protocol Version Validation
- Only accept `protocolVersion: "2025-11-25"`
- Return error for unsupported versions

### Capability Negotiation

#### Server Capabilities (advertise in InitializeResult)

```typescript
{
  capabilities: {
    tools: {
      listChanged: true  // Support tools/listChanged notification
    },
    logging: {},         // Logging support enabled
    completions: {},     // Completion support enabled
    experimental: {
      "oauth-m2m": {}    // M2M OAuth extension
    }
  },
  serverInfo: {
    name: "mcp-reference-server",
    version: "1.0.0",
    description: "MCP 2025-11-25 Reference Implementation"
  }
}
```

#### Client Capability Recognition
- Recognize `roots.listChanged` capability
- Only use features client advertised
- Store capabilities for session duration

### Tools Implementation

#### Tool Definition Schema

```typescript
interface Tool {
  name: string;              // lowercase_with_underscores
  title?: string;            // Human-readable display name
  description: string;       // Clear description for LLM
  inputSchema: JsonSchema;   // JSON Schema 2020-12
  outputSchema?: JsonSchema; // Optional result schema
  annotations?: {
    readOnlyHint?: boolean;      // No side effects
    destructiveHint?: boolean;   // Modifies data
    idempotentHint?: boolean;    // Safe to repeat
    openWorldHint?: boolean;     // Accesses external services
  };
}
```

#### Sample Tools

##### 1. Calculator (`calculate`)

```typescript
{
  name: "calculate",
  title: "Calculator",
  description: "Perform basic arithmetic operations. Supports add, subtract, multiply, divide. Example: calculate({operation: 'add', a: 5, b: 3}) returns 8.",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["add", "subtract", "multiply", "divide"],
        description: "The arithmetic operation to perform"
      },
      a: { type: "number", description: "First operand" },
      b: { type: "number", description: "Second operand" }
    },
    required: ["operation", "a", "b"]
  },
  outputSchema: {
    type: "object",
    properties: {
      result: { type: "number" },
      expression: { type: "string" }
    },
    required: ["result", "expression"]
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true
  }
}
```

##### 2. Dice Roller (`roll_dice`)

```typescript
{
  name: "roll_dice",
  title: "Dice Roller",
  description: "Roll dice using standard notation. Examples: '2d6' rolls two 6-sided dice, '1d20+5' rolls one d20 and adds 5.",
  inputSchema: {
    type: "object",
    properties: {
      notation: {
        type: "string",
        pattern: "^\\d+d\\d+(\\+\\d+)?$",
        description: "Dice notation (e.g., '2d6', '1d20+5')"
      }
    },
    required: ["notation"]
  },
  outputSchema: {
    type: "object",
    properties: {
      rolls: { type: "array", items: { type: "number" } },
      modifier: { type: "number" },
      total: { type: "number" }
    },
    required: ["rolls", "total"]
  },
  annotations: {
    readOnlyHint: true
  }
}
```

##### 3. Fortune Teller (`tell_fortune`)

```typescript
{
  name: "tell_fortune",
  title: "Fortune Teller",
  description: "Receive a mystical fortune reading. Choose a category for themed fortunes.",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["love", "career", "health", "wealth", "general"],
        description: "Fortune category",
        default: "general"
      },
      mood: {
        type: "string",
        enum: ["optimistic", "mysterious", "humorous"],
        description: "Tone of the fortune",
        default: "mysterious"
      }
    }
  },
  annotations: {
    readOnlyHint: true
  }
}
```

#### Tool Operations

##### `tools/list`
- Request: `{ cursor?: string }`
- Response: `{ tools: Tool[], nextCursor?: string }`
- Page size: 50 items (configurable)
- Cursor: opaque string, stable across requests

##### `tools/call`
- Request: `{ name: string, arguments?: object, _meta?: { progressToken?: string | number } }`
- Response: `{ content: Content[], isError?: boolean }`
- Validate arguments against `inputSchema`
- Support progress notifications via `progressToken`

##### `notifications/tools/listChanged`
- Emit when tools added/removed/modified
- Only if `tools.listChanged` capability advertised

#### Tool Result Content Types

```typescript
type Content = TextContent | ImageContent | AudioContent | EmbeddedResource;

interface TextContent {
  type: "text";
  text: string;
  annotations?: ContentAnnotations;
}

interface ImageContent {
  type: "image";
  data: string;  // base64
  mimeType: string;
  annotations?: ContentAnnotations;
}

interface AudioContent {
  type: "audio";
  data: string;  // base64
  mimeType: string;
  annotations?: ContentAnnotations;
}

interface EmbeddedResource {
  type: "resource";
  resource: Resource;
  annotations?: ContentAnnotations;
}

interface ContentAnnotations {
  audience?: ("user" | "assistant")[];
  priority?: number;  // 0-1
}
```

### Error Handling

#### Standard JSON-RPC Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse Error | Invalid JSON |
| -32600 | Invalid Request | Not a valid request object |
| -32601 | Method Not Found | Method doesn't exist |
| -32602 | Invalid Params | Invalid method parameters |
| -32603 | Internal Error | Internal JSON-RPC error |

#### Tool Execution Errors (SEP-1303)

Input validation errors return as tool results with `isError: true`:

```typescript
// CORRECT - enables LLM self-correction
{
  content: [{
    type: "text",
    text: "Invalid operation 'modulo'. Supported: add, subtract, multiply, divide"
  }],
  isError: true
}

// WRONG - protocol error prevents LLM correction
{
  error: {
    code: -32602,
    message: "Invalid params"
  }
}
```

#### Error Response Best Practices
- Never expose internal stack traces
- Provide actionable error messages
- Include relevant context in error data
- Log full details server-side

---

## P1: Transport Layer & Utilities

### stdio Transport

#### Message Framing
- Newline-delimited JSON
- One complete JSON object per line
- UTF-8 encoding required
- No length prefix needed

#### Stream Usage
| Stream | Purpose |
|--------|---------|
| stdin | Server reads client messages |
| stdout | Server writes responses/notifications |
| stderr | Server writes log output (all severity levels) |

#### Process Lifecycle
1. Server starts, waits for `initialize` on stdin
2. Server MUST NOT write to stdout before receiving `initialize`
3. On shutdown: exit cleanly with code 0
4. On error: may exit with non-zero code

#### Implementation Requirements
- Buffer stdin reads appropriately
- Flush stdout after each message
- Handle SIGTERM/SIGINT gracefully
- Clean up resources on exit

### Streamable HTTP Transport

#### Endpoint Design
Single endpoint (e.g., `/mcp`) supporting:
- **POST**: Client-to-server messages
- **GET**: Open SSE stream for server-initiated messages

#### Required Headers

**Request Headers:**
```
Content-Type: application/json (POST)
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-11-25
MCP-Session-Id: <session-id> (after initialization)
Authorization: Bearer <token> (when authenticated)
```

**Response Headers:**
```
Content-Type: application/json | text/event-stream
MCP-Session-Id: <session-id> (on InitializeResult)
```

#### Session Management
- Server assigns session ID on initialization
- Session ID: globally unique, cryptographically secure
- Character set: visible ASCII (0x21-0x7E)
- Client includes session ID in subsequent requests
- Server validates session ID on each request

#### POST Request Handling
- Request body: JSON-RPC message
- Response:
  - Requests → JSON-RPC response (result or error)
  - Notifications → HTTP 202 Accepted (empty body)

#### GET Request (SSE Stream)
- Client opens SSE stream for server-initiated messages
- Event format: `data: <json-rpc-message>\n\n`
- Event IDs encode stream position for replay (SEP-1699)
- Support reconnection with `Last-Event-Id` header

#### SSE Reconnection with Replay

```typescript
// Event ID format: "<session>:<sequence>"
// Example: "abc123:42"

// On reconnect, client sends Last-Event-Id header
// Server replays events after that sequence number

interface SSEEvent {
  id: string;          // session:sequence
  event?: string;      // event type
  data: string;        // JSON-RPC message
}
```

#### Security Requirements
- HTTPS required in production
- Validate Origin header (403 for invalid)
- Implement CORS appropriately
- Rate limiting deferred to reverse proxy

#### Stateless Mode
Server MAY operate without sessions for horizontal scaling:
- No `MCP-Session-Id` header
- Each request independent
- No SSE (no server-initiated messages)
- Suitable for simple tool-only servers
- Configurable via `MCP_STATELESS_MODE=true`

### Pagination

#### Request/Response Pattern

```typescript
// Request
{ cursor?: string }

// Response
{
  items: T[],
  nextCursor?: string  // Absent = last page
}
```

#### Implementation
- Cursor format: opaque to client, server-defined
- May encode: offset, timestamp, ID, etc.
- Default page size: 50 items
- Maximum page size: enforced (configurable)
- Cursors stable across requests

#### Paginated Methods (Phase 1)
- `tools/list`

### Progress Notifications

#### Progress Token Flow

```
Client                          Server
  │                               │
  │─── tools/call ───────────────▶│
  │    {name, arguments,          │
  │     _meta: {progressToken}}   │
  │                               │
  │◀── notifications/progress ───│
  │    {progressToken, progress,  │
  │     total?, message?}         │
  │    ... (multiple)             │
  │                               │
  │◀── tools/call response ──────│
  │    {content, isError?}        │
```

#### Progress Notification Structure

```typescript
{
  progressToken: string | number;  // From request _meta
  progress: number;                // Current value
  total?: number;                  // For percentage (optional)
  message?: string;                // Status message
}
```

#### Rate Limiting
- Configurable throttle interval: 100ms default
- Debounce rapid updates
- Maximum 10 updates/second per request
- Configure via `MCP_PROGRESS_INTERVAL_MS`

---

## P2: OAuth 2.1 Authorization

### Overview

#### Role Mapping
| MCP Role | OAuth Role |
|----------|------------|
| MCP Server | Resource Server (validates tokens) |
| MCP Client | OAuth Client (obtains tokens) |
| Auth Server | Authorization Server (issues tokens) |
| User | Resource Owner |

#### Supported Flow
Authorization Code with PKCE (interactive users)

### Authorization Server Discovery

#### Protected Resource Metadata (RFC 9728)

Serve at: `/.well-known/oauth-protected-resource`

```json
{
  "resource": "https://mcp-server.example.com",
  "authorization_servers": [
    "https://auth0.example.com"
  ],
  "scopes_supported": [
    "tools:read",
    "tools:execute",
    "logging:write"
  ]
}
```

#### WWW-Authenticate on 401

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="mcp",
  resource_metadata="https://mcp-server.example.com/.well-known/oauth-protected-resource"
```

### Client Registration

#### Priority Order
1. **Pre-registration** (preferred for production)
2. **Client ID Metadata Documents (CIMD)** - SEP-991
3. **Dynamic Client Registration** (RFC 7591)
4. **Manual Configuration** (fallback)

#### CIMD Structure (for public clients)

Client hosts JSON at its `client_id` URL:

```json
{
  "client_id": "https://my-mcp-client.example.com/client.json",
  "client_name": "My MCP Client",
  "redirect_uris": ["https://my-mcp-client.example.com/callback"],
  "grant_types": ["authorization_code"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "tools:read tools:execute"
}
```

### Authorization Code Flow with PKCE

#### Complete Flow

```
┌─────────────┐                               ┌─────────────┐
│  MCP Client │                               │ Auth Server │
└──────┬──────┘                               └──────┬──────┘
       │                                              │
       │ 1. Generate PKCE (verifier + challenge)      │
       │                                              │
       │ 2. Open browser to /authorize ──────────────▶│
       │    ?response_type=code                       │
       │    &client_id=...                           │
       │    &redirect_uri=...                        │
       │    &scope=...                               │
       │    &state=...                               │
       │    &code_challenge=...                      │
       │    &code_challenge_method=S256              │
       │    &resource=https://mcp-server...          │
       │                                              │
       │                    3. User authenticates     │
       │                       & consents             │
       │                                              │
       │◀───────────── 4. Redirect with code ────────│
       │    ?code=...&state=...                       │
       │                                              │
       │ 5. POST /token ─────────────────────────────▶│
       │    grant_type=authorization_code             │
       │    code=...                                  │
       │    redirect_uri=...                          │
       │    client_id=...                             │
       │    code_verifier=...                         │
       │    resource=https://mcp-server...            │
       │                                              │
       │◀────────────── 6. Token Response ───────────│
       │    {access_token, token_type,                │
       │     expires_in, refresh_token?, scope}       │
       │                                              │
       │ 7. API Request with Bearer token ───────────▶│ MCP Server
       │                                              │
```

### PKCE Implementation

#### Code Verifier Generation
- Length: 43-128 characters
- Characters: `[A-Z] [a-z] [0-9] - . _ ~`
- MUST be cryptographically random
- Generate new verifier for each authorization

```typescript
function generateCodeVerifier(): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const length = 64;  // Between 43-128
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomBytes)
    .map(b => charset[b % charset.length])
    .join('');
}
```

#### Code Challenge Computation
- Method: S256 (SHA-256) - REQUIRED
- Algorithm: `BASE64URL(SHA256(code_verifier))`
- No padding in BASE64URL encoding

```typescript
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64url.encode(new Uint8Array(hash));
}
```

### Resource Indicators (RFC 8707)

- Include `resource` parameter in authorization request
- Include `resource` parameter in token request
- Value: MCP server's URL
- Server validates token audience matches resource

### Scope Management

#### Defined Scopes
| Scope | Description |
|-------|-------------|
| `tools:read` | List and describe tools |
| `tools:execute` | Execute tools |
| `logging:write` | Emit log messages |

#### Incremental Consent (SEP-835)
- Request minimal scopes initially
- Server returns 403 with required scope in `WWW-Authenticate`
- Client initiates new authorization for additional scope
- Retry original request with enhanced token

### Token Management

#### Access Token Handling
- Store tokens securely (encrypted at rest)
- Never log or expose tokens
- Include in `Authorization: Bearer <token>` header only
- Validate token before each request

#### Token Refresh
1. When access token expires (check `expires_in`)
2. POST to token_endpoint with `grant_type: refresh_token`
3. Include `refresh_token` and `client_id`
4. Store new tokens, discard old

### Auth0 Integration Example

#### Environment Configuration

```bash
# Auth0 Configuration
MCP_AUTH0_DOMAIN=your-tenant.auth0.com
MCP_AUTH0_AUDIENCE=https://your-mcp-server.example.com
MCP_AUTH0_CLIENT_ID=your_client_id
```

#### Metadata Endpoint Response

```json
{
  "resource": "https://your-mcp-server.example.com",
  "authorization_servers": [
    "https://your-tenant.auth0.com"
  ],
  "scopes_supported": ["tools:read", "tools:execute", "logging:write"]
}
```

### Completions

#### `completion/complete` Method

```typescript
// Request
{
  ref: {
    type: "ref/prompt" | "ref/resource",
    name?: string,
    uri?: string
  },
  argument: {
    name: string,   // Argument name
    value: string   // Partial value
  }
}

// Response
{
  completion: {
    values: string[],    // Suggestions
    total?: number,      // Total available
    hasMore?: boolean    // More available
  }
}
```

#### Fortune Teller Completions

```typescript
// For category argument, return matching categories
const categories = ["love", "career", "health", "wealth", "general"];

function getCompletions(argName: string, partial: string): string[] {
  if (argName === "category") {
    return categories.filter(c => c.startsWith(partial.toLowerCase()));
  }
  if (argName === "mood") {
    return ["optimistic", "mysterious", "humorous"]
      .filter(m => m.startsWith(partial.toLowerCase()));
  }
  return [];
}
```

### Logging

#### Log Levels (RFC 5424)

| Level | Description |
|-------|-------------|
| debug | Detailed debugging |
| info | General information |
| notice | Normal but significant |
| warning | Warning conditions |
| error | Error conditions |
| critical | Critical conditions |
| alert | Immediate action required |
| emergency | System unusable |

#### `logging/setLevel` Method

```typescript
// Request
{ level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency" }

// Server filters logs at or above this level
// Default level: "info"
```

#### `notifications/message`

```typescript
{
  level: LogLevel,
  logger?: string,    // Logger name
  data?: any,         // Structured data
  message: string     // Log message
}
```

---

## P3: Extensions Framework

### Extension Naming
- Format: `namespace/extension-name`
- Example: `anthropic/oauth-m2m`
- Custom extensions use organization namespace

### Extension Negotiation

During initialization:
1. Client advertises in `capabilities.experimental`
2. Server responds with supported extensions
3. Only mutually supported extensions enabled

```typescript
// Client capabilities
{
  experimental: {
    "oauth-m2m": {}
  }
}

// Server capabilities
{
  experimental: {
    "oauth-m2m": {
      supported_grant_types: ["client_credentials"]
    }
  }
}
```

### M2M OAuth Extension (SEP-1046)

#### Purpose
Machine-to-machine authentication for autonomous agents and services without human user interaction.

#### Use Cases
- Scheduled agent jobs
- Service-to-service communication
- Background automation
- Headless agent systems

#### Client Credentials Flow

```
┌─────────────┐                               ┌─────────────┐
│  M2M Client │                               │ Auth Server │
└──────┬──────┘                               └──────┬──────┘
       │                                              │
       │ 1. POST /token ─────────────────────────────▶│
       │    grant_type=client_credentials             │
       │    client_id=service_id                      │
       │    client_secret=service_secret              │
       │    scope=tools:execute                       │
       │    resource=https://mcp-server...            │
       │                                              │
       │◀────────────── 2. Token Response ───────────│
       │    {access_token, token_type, expires_in}    │
       │    (NO refresh_token)                        │
       │                                              │
       │ 3. API Request with Bearer token ───────────▶│ MCP Server
       │                                              │
```

#### Extension Capability

```typescript
{
  experimental: {
    "oauth-m2m": {
      supported_grant_types: ["client_credentials"],
      token_endpoint: "https://auth0.example.com/oauth/token"
    }
  }
}
```

#### Security Considerations
- `client_secret` MUST be stored securely
- Use environment variables or secret managers
- Never commit secrets to version control
- Rotate secrets periodically
- Limit scope to minimum required permissions

---

## P4: Observability

### OpenTelemetry Integration

#### Setup

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const sdk = new NodeSDK({
  serviceName: 'mcp-reference-server',
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
  }),
});

sdk.start();
```

### Structured Logging

#### Format (JSON)

```json
{
  "timestamp": "2025-01-14T10:30:00.000Z",
  "level": "info",
  "traceId": "abc123...",
  "spanId": "def456...",
  "message": "Tool executed",
  "data": {
    "tool": "calculate",
    "duration_ms": 5
  }
}
```

### Metrics

#### Key Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `mcp.requests.total` | Counter | Request count by method |
| `mcp.requests.duration` | Histogram | Request latency (p50, p95, p99) |
| `mcp.errors.total` | Counter | Error count by code |
| `mcp.sessions.active` | Gauge | Active sessions |
| `mcp.tools.executions` | Counter | Tool execution count by name |
| `mcp.auth.attempts` | Counter | Auth attempts (success/failure) |

### Tracing

#### Trace Context
- Assign trace ID to each request
- Propagate via `traceparent` header (W3C Trace Context)
- Log trace ID with all related entries
- Support distributed tracing standards

### Health Endpoints

#### `/health` (Liveness)

```json
{
  "status": "healthy",
  "timestamp": "2025-01-14T10:30:00.000Z"
}
```

#### `/ready` (Readiness)

```json
{
  "status": "ready",
  "checks": {
    "auth_server": "ok",
    "tool_registry": "ok"
  }
}
```

### Debug Mode

Enable via `MCP_DEBUG=true`:
- Verbose logging (debug level)
- Request/response dumping
- Performance timing output

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_PORT` | 3000 | HTTP transport port |
| `MCP_HOST` | 0.0.0.0 | HTTP bind address |
| `MCP_TRANSPORT` | both | Transport mode: stdio, http, both |
| `MCP_STATELESS_MODE` | false | Enable stateless HTTP mode |
| `MCP_PAGE_SIZE` | 50 | Default pagination size |
| `MCP_REQUEST_TIMEOUT_MS` | 60000 | Request timeout |
| `MCP_SHUTDOWN_TIMEOUT_MS` | 30000 | Graceful shutdown timeout |
| `MCP_PROGRESS_INTERVAL_MS` | 100 | Progress notification throttle |
| `MCP_DEBUG` | false | Enable debug mode |
| `MCP_LOG_LEVEL` | info | Minimum log level |
| `MCP_AUTH0_DOMAIN` | - | Auth0 tenant domain |
| `MCP_AUTH0_AUDIENCE` | - | Auth0 API audience |
| `MCP_AUTH0_CLIENT_ID` | - | Auth0 client ID |
| `MCP_M2M_CLIENT_SECRET` | - | M2M client secret |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | - | OpenTelemetry endpoint |

---

## Graceful Shutdown

### Shutdown Sequence

1. Receive SIGTERM/SIGINT
2. Stop accepting new connections
3. Set readiness to not ready (`/ready` returns 503)
4. Wait for in-flight requests (up to `MCP_SHUTDOWN_TIMEOUT_MS`)
5. Close SSE streams gracefully
6. Clean up resources
7. Exit with code 0

### Implementation

```typescript
process.on('SIGTERM', async () => {
  logger.info('Shutdown initiated');

  server.stop();  // Stop accepting new requests

  await Promise.race([
    waitForInflightRequests(),
    timeout(config.shutdownTimeoutMs)
  ]);

  await cleanup();
  process.exit(0);
});
```

---

## Testing Strategy

### Unit Tests
- Protocol message parsing/serialization
- PKCE generation and validation
- Tool input validation
- Error code mapping
- Capability negotiation logic

### Integration Tests
- Full stdio transport flow
- HTTP transport with session management
- SSE stream with reconnection
- OAuth authorization flow
- Tool execution end-to-end

### MCP Inspector Compatibility
- Validate against official MCP Inspector
- Test all protocol methods
- Verify capability advertisement
- Confirm error handling

---

## Implementation Checklist

### P0: Core Protocol
- [ ] JSON-RPC 2.0 message parsing and serialization
- [ ] Request/response correlation by ID
- [ ] Notification handling (no response)
- [ ] initialize/initialized handshake
- [ ] Protocol version validation
- [ ] Server capability advertisement
- [ ] Client capability recognition
- [ ] Tool definition schema
- [ ] tools/list implementation
- [ ] tools/call implementation
- [ ] Input validation against JSON Schema
- [ ] Standard error codes
- [ ] Error response formatting

### P1: Transport & Utilities
- [ ] stdio message framing
- [ ] stdio stream handling
- [ ] stderr logging
- [ ] Streamable HTTP endpoint
- [ ] POST request handling
- [ ] GET SSE stream
- [ ] Session ID management
- [ ] MCP-Protocol-Version header
- [ ] Origin validation
- [ ] Pagination cursor support
- [ ] Progress token handling
- [ ] Progress notification emission

### P2: OAuth 2.1 Authorization
- [ ] Protected Resource Metadata endpoint
- [ ] WWW-Authenticate header on 401
- [ ] Authorization server discovery
- [ ] Client registration support (CIMD)
- [ ] PKCE code verifier generation
- [ ] PKCE S256 challenge computation
- [ ] Authorization request construction
- [ ] State parameter generation and validation
- [ ] Token exchange implementation
- [ ] Resource indicator support (RFC 8707)
- [ ] Access token validation
- [ ] Token refresh handling
- [ ] Scope validation and enforcement
- [ ] Incremental consent support
- [ ] Secure token storage
- [ ] completion/complete method
- [ ] logging/setLevel method
- [ ] notifications/message emission

### P3: Extensions Framework
- [ ] Extension capability negotiation
- [ ] Extension settings handling
- [ ] M2M OAuth extension
- [ ] Client credentials flow
- [ ] M2M token management

### P4: Observability
- [ ] Structured logging
- [ ] Metrics collection
- [ ] Request tracing
- [ ] Health check endpoints
- [ ] Debug mode

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| TypeScript + Node.js 20 | Official SDK available, strong async support, LTS stability |
| Official MCP SDK | Proven patterns, faster development, community support |
| Environment variables only | 12-factor app principles, container-friendly |
| Full OAuth 2.1 + PKCE | Complete reference implementation per spec |
| Auth0 examples | Concrete, widely-used provider for documentation |
| Full M2M OAuth extension | Demonstrates complete extension framework |
| OpenTelemetry | Industry standard, vendor-neutral observability |
| Both transports (stdio + HTTP) | Full flexibility for all deployment scenarios |
| Stateful + stateless HTTP | Demonstrates both patterns per spec |
| SSE replay support | Full SEP-1699 compliance |
| 50 item page size | Balance of performance and usability |
| Strict error separation | SEP-1303 compliance for LLM self-correction |
| Progress rate limiting (100ms) | Prevent client flooding |
| Configurable shutdown timeout | Production-grade graceful termination |

---

## Open Questions

None - all requirements clarified during interview.

---

## Future Enhancements (Phase 2)

The following are explicitly out of scope for Phase 1:
- Resources and Resource Templates
- Prompts
- Sampling (LLM requests)
- Cancellation
- Tasks primitive
- Elicitation (user input)
- MCP Bundles
- Icons for primitives
