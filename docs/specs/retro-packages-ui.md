# packages/ui - Retroactive Specification

**Generated**: 2026-01-20
**Source**: `/Users/chiefbuilder/Documents/Projects/MCP_11252025_Reference/packages/ui`
**Type**: Retroactive (documents existing behavior)

## Overview

A React-based chat UI for interacting with MCP (Model Context Protocol) servers. Provides a streaming chat interface with OAuth 2.1/PKCE authentication, real-time SSE message streaming, tool call visualization, and MCP protocol integration.

## Public Interface

### Components

| Name | Type | Description |
|------|------|-------------|
| `App` | Component | Root application with auth state machine |
| `ChatView` | Component | Main chat interface with messages and input |
| `MessageList` | Component | Scrollable message display |
| `MessageInput` | Component | Text input with send/cancel buttons |
| `UserMessage` | Component | User message bubble |
| `AssistantMessage` | Component | Assistant message with markdown support |
| `ToolCall` | Component | Tool call/result visualization |
| `ToolsPanel` | Component | Collapsible panel showing available MCP tools |
| `ToolCard` | Component | Individual tool display with parameters |
| `ErrorBoundary` | Component | React error boundary wrapper |

### Hooks

| Name | Return Type | Description |
|------|-------------|-------------|
| `useChat` | `UseChatReturn` | Chat state management with SSE streaming |
| `useSSE` | `UseSSEReturn` | Low-level SSE streaming with retry logic |
| `useMCP` | `UseMCPReturn` | MCP protocol client (initialize, listTools) |
| `useTools` | `UseToolsReturn` | Tool list fetching and normalization |

### Lib Utilities

| Name | Type | Description |
|------|------|-------------|
| `apiRequest` | Function | Authenticated fetch wrapper with retry |
| `get`, `post`, `put`, `del` | Functions | HTTP method helpers |
| `streamingPost` | Function | SSE streaming POST for chat |
| `onAuthChange` | Function | Subscribe to auth state changes |
| `login` | Function | Initiate OAuth PKCE flow |
| `handleCallback` | Function | Process OAuth callback |
| `logout` | Function | Clear tokens and session |
| `getToken` | Function | Get current access token |
| `isAuthenticated` | Function | Check auth status |
| `refreshToken` | Function | Refresh expired token |

### Types

```typescript
// Message Types
type MessageRole = 'user' | 'assistant';

interface ToolCallData {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'complete';
}

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallData[];
}

// SSE Event Types
type SSEEvent =
  | SSETokenEvent      // { type: 'token', content: string }
  | SSEToolCallEvent   // { type: 'tool_call', name: string, args: Record }
  | SSEToolResultEvent // { type: 'tool_result', name: string, result: unknown }
  | SSEDoneEvent       // { type: 'done', usage: TokenUsage }
  | SSEErrorEvent;     // { type: 'error', code: string, message: string }

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

// Tool Types
interface MCPTool {
  name: string;
  description?: string;
  inputSchema: { type: 'object'; properties?: Record; required?: string[] };
}

interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

// Auth Types
interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}
```

## Behavior

### Core Functionality

#### 1. Chat Flow (`useChat` + `useSSE`)

- **Input**: User message string
- **Output**: Streaming assistant response with tool calls
- **Flow**:
  1. User submits message via `sendMessage()`
  2. User message added to state immediately
  3. Empty assistant message placeholder created
  4. SSE POST to `/api/chat` with message + sessionId
  5. Stream events update assistant message content incrementally
  6. Tool calls displayed inline as they occur
  7. `done` event marks completion

- **Side effects**:
  - sessionStorage for session ID
  - Server-side cancel via POST `/api/cancel`

#### 2. MCP Protocol (`useMCP`)

- **Input**: None (auto-initializes)
- **Output**: Session ID, tool list
- **Flow**:
  1. Send `initialize` JSON-RPC request with protocol version `2025-11-25`
  2. Extract `mcp-session-id` from response header
  3. Send `notifications/initialized` to complete handshake
  4. Use session ID for subsequent `tools/list` requests

- **Headers required**:
  - `mcp-protocol-version: 2025-11-25`
  - `mcp-session-id: <id>` (after initialize)
  - `Authorization: Bearer <token>` (if authenticated)

#### 3. Authentication (`lib/auth`)

- **Input**: OAuth config (clientId, issuer, redirectUri, scopes)
- **Output**: Access token, refresh token
- **Flow**:
  1. `login()`: Generate PKCE code_verifier + code_challenge
  2. Store in sessionStorage, redirect to `/oauth/authorize`
  3. `handleCallback()`: Validate state, exchange code for tokens
  4. Store tokens in sessionStorage with expiry
  5. `getToken()`: Return token if valid (60s buffer before expiry)
  6. `refreshToken()`: Use refresh_token grant to get new access token

- **PKCE method**: S256 (SHA-256 hash, base64url encoded)
- **Storage**: sessionStorage (cleared on tab close)

#### 4. API Client (`lib/api`)

- **Input**: URL, options (headers, body, auth settings)
- **Output**: Typed response data
- **Behaviors**:
  - Auto-adds `Authorization: Bearer <token>` header
  - On 401: Attempt token refresh, retry once
  - On refresh failure: Call `logout()`, notify subscribers
  - On 429: Extract `Retry-After` header, throw with `retryAfter`
  - On 5xx: Throw generic server error

### Error Handling

| Condition | Behavior |
|-----------|----------|
| Network error during SSE | Exponential backoff retry (max 3, 1s→10s delay) |
| 401 Unauthorized | Token refresh, retry; if fails, forced logout |
| 429 Rate Limited | Extract Retry-After, display countdown, auto-retry |
| 500+ Server Error | Display generic error message |
| Missing root element | Throw on mount |
| React component error | Caught by ErrorBoundary |
| Invalid OAuth state | Clear storage, show error |
| Token expired | Return null from `getToken()`, trigger refresh |

### Edge Cases

- **Empty messages**: Prevented at input level (trim check)
- **Rapid message sends**: Blocked while `isLoading` or `isStreaming`
- **Stale SSE callbacks**: Use refs for streaming message ID to avoid closure issues
- **Multiple abort requests**: AbortController replaced on each new request
- **Token refresh race**: `skipRetry` flag prevents infinite loops
- **PKCE replay**: State and code_verifier cleared after use

## Dependencies

### Internal (from parent monorepo)
- None (standalone package)

### External

| Package | Purpose |
|---------|---------|
| `react` 18.3 | UI framework |
| `react-dom` 18.3 | DOM rendering |
| `react-markdown` | Markdown rendering in messages |
| `rehype-highlight` | Code syntax highlighting |
| `rehype-sanitize` | HTML sanitization |
| `@radix-ui/react-slot` | Primitive component composition |
| `class-variance-authority` | Component variant styling |
| `clsx` + `tailwind-merge` | Class name utilities |
| `lucide-react` | Icon library |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `vite` 5.4 | Build tool |
| `typescript` ~5.6 | Type system |
| `tailwindcss` 3.4 | Utility CSS |
| `@vitejs/plugin-react` | React Fast Refresh |
| `eslint` 9 | Linting |

## Integration Points

### Consumers
- Standalone web application (served via Vite)
- Communicates with MCP server backend

### Called Services

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST (SSE) | Send message, receive streaming response |
| `/api/cancel` | POST | Cancel in-progress generation |
| `/api/health` | GET | Health check (unused in UI currently) |
| `/mcp` | POST | MCP JSON-RPC (initialize, tools/list) |
| `/oauth/authorize` | GET | OAuth authorization redirect |
| `/oauth/token` | POST | Token exchange (code→tokens, refresh) |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_AUTH_REQUIRED` | `'true'` | Enable/disable auth requirement |
| `VITE_OAUTH_CLIENT_ID` | `'mcp-ui-client'` | OAuth client ID |
| `VITE_OAUTH_ISSUER` | `window.location.origin` | OAuth server URL |
| `VITE_OAUTH_REDIRECT_URI` | `origin/callback` | OAuth callback URL |

## Test Coverage

**Test files**: None
**Coverage**: 0%

### Tested Behaviors
- [ ] None - no tests exist

### Untested Behaviors
- [ ] useChat message flow
- [ ] useSSE retry logic
- [ ] useMCP protocol handshake
- [ ] useTools normalization
- [ ] OAuth PKCE flow
- [ ] Token refresh logic
- [ ] API error handling
- [ ] Component rendering
- [ ] Auth state machine transitions

## Observations

### Patterns Used
- **State machine**: App auth state (`loading` → `callback` → `authenticated`/`unauthenticated`)
- **Refs for callbacks**: Avoid stale closures in SSE handlers
- **Event emitter**: `onAuthChange` for cross-component auth state
- **Exponential backoff**: SSE reconnection (1s, 2s, 4s... up to 10s)
- **Optimistic UI**: User message added before server response
- **Token buffer**: 60s before expiry triggers refresh

### Technical Debt
- **No tests**: Entire UI package lacks test coverage
- **Hardcoded suggestions**: PROMPT_SUGGESTIONS array in ChatView
- **Mixed concerns**: auth.ts handles both OAuth flow and token storage
- **No error boundaries per feature**: Single global ErrorBoundary

### Potential Improvements
- Add unit tests for hooks (useChat, useSSE, useMCP)
- Add integration tests for auth flow
- Extract token storage to separate module
- Add Storybook for component documentation
- Consider React Query for data fetching
- Add loading skeletons for better UX

## Open Questions

- Is the 60-second token expiry buffer sufficient for all use cases?
- Should SSE retry on non-network errors (e.g., 500)?
- Is sessionStorage the right choice vs localStorage for tokens?
- Should tool calls be rendered as expandable accordions for large args?
- How should the UI handle MCP server version mismatches?
