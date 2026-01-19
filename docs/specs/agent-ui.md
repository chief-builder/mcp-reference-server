# Agent UI Specification

> Web-based chat interface for the MCP Reference Server agent

**Status**: Draft
**Created**: 2026-01-19
**MCP Protocol Version**: 2025-11-25

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technical Stack](#technical-stack)
4. [UI Components](#ui-components)
5. [API Design](#api-design)
6. [Authentication](#authentication)
7. [Data Flow](#data-flow)
8. [Error Handling](#error-handling)
9. [Implementation Plan](#implementation-plan)
10. [Open Questions](#open-questions)

---

## Overview

### Goals

Build an end-user chat interface that:
- Provides a production-quality chat experience for interacting with MCP tools
- Uses OpenRouter with `google/gemini-2.5-flash-lite` for LLM inference
- Streams LLM responses token-by-token (ChatGPT-style)
- Shows tool calls and results transparently below messages
- Integrates with the existing MCP 2025-11-25 OAuth 2.1 authentication
- Demonstrates proper MCP client implementation (UI as MCP client)
- Lives within this repository as `packages/ui`

### Non-Goals

- Conversation persistence (session-only for MVP)
- User account management (uses existing OAuth)
- Mobile-native apps (web-responsive only)
- Multi-server connections (single MCP server)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Browser                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     React App (packages/ui)                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐│   │
│  │  │  Chat View  │  │ Tools Panel │  │   Message Components     ││   │
│  │  │             │  │             │  │  - User message          ││   │
│  │  │ - Input     │  │ - Tool list │  │  - Assistant message     ││   │
│  │  │ - Messages  │  │ - Schemas   │  │  - Tool call (collapsed) ││   │
│  │  │ - Streaming │  │             │  │  - Tool result           ││   │
│  │  └─────────────┘  └─────────────┘  └──────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              │ SSE + JSON-RPC                            │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────────┐
│                      Backend (Node.js/Express)                           │
│  ┌───────────────────────────┴───────────────────────────────────────┐  │
│  │                    Express Routes                                  │  │
│  │  POST /mcp           - MCP JSON-RPC (tools/list, tools/call, etc) │  │
│  │  GET  /mcp           - MCP SSE stream (notifications, progress)   │  │
│  │  POST /api/chat      - Agent chat, returns SSE stream             │  │
│  │  POST /api/cancel    - Abort in-progress generation               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                           │
│  ┌───────────────────────────┴───────────────────────────────────────┐  │
│  │                    Agent Orchestrator (src/client/agent.ts)        │  │
│  │  - Vercel AI SDK generateText() with tool calling                 │  │
│  │  - Connects to MCP Server via MCPClient                           │  │
│  │  - Streams responses via SSE to frontend                          │  │
│  │  - Handles abort signals (AbortController)                        │  │
│  └────────────────┬─────────────────────────────┬────────────────────┘  │
│                   │                             │                        │
│                   ▼                             ▼                        │
│  ┌────────────────────────────┐  ┌───────────────────────────────────┐  │
│  │     LLM Provider           │  │  MCP Server (HTTP Transport)      │  │
│  │  ┌──────────────────────┐  │  │  - Session-based (mcp-session-id) │  │
│  │  │      OpenRouter      │  │  │  - Tools:                         │  │
│  │  │  ┌────────────────┐  │  │  │    • calculate                    │  │
│  │  │  │ google/gemini- │  │  │  │    • roll_dice                    │  │
│  │  │  │ 2.5-flash-lite │  │  │  │    • tell_fortune                 │  │
│  │  │  └────────────────┘  │  │  │                                   │  │
│  │  └──────────────────────┘  │  └───────────────────────────────────┘  │
│  │  OPENROUTER_API_KEY (env)  │                                         │
│  └────────────────────────────┘                                         │
└──────────────────────────────────────────────────────────────────────────┘
                   │
                   │ HTTPS
                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     OpenRouter API (openrouter.ai)                       │
│  - Model: google/gemini-2.5-flash-lite                                  │
│  - Streaming: Yes (text/event-stream)                                   │
│  - Tool calling: Yes (function calling support)                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM Provider | OpenRouter | Unified API for multiple models, existing integration |
| LLM Model | google/gemini-2.5-flash-lite | Fast, cost-effective, good tool calling support |
| LLM API keys | Server-side only (OPENROUTER_API_KEY) | Security - never expose keys to browser |
| MCP connection | Embedded HTTP server | Simplifies deployment, single process |
| Streaming | SSE (per MCP spec) | Matches MCP 2025-11-25, simpler than WebSocket |
| State management | React hooks + context | Lightweight for session-only state |
| Conversation storage | Memory only | MVP scope - no database needed |

---

## Technical Stack

### Frontend (`packages/ui`)

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatView.tsx         # Main chat container
│   │   │   ├── MessageInput.tsx     # Text input with send/cancel
│   │   │   ├── MessageList.tsx      # Scrolling message container
│   │   │   ├── UserMessage.tsx      # User message bubble
│   │   │   ├── AssistantMessage.tsx # Assistant with streaming
│   │   │   └── ToolCall.tsx         # Collapsible tool display
│   │   ├── tools/
│   │   │   ├── ToolsPanel.tsx       # Available tools sidebar
│   │   │   └── ToolCard.tsx         # Individual tool display
│   │   └── ui/                      # shadcn/ui components
│   ├── hooks/
│   │   ├── useChat.ts               # Chat state management
│   │   ├── useSSE.ts                # SSE connection handling
│   │   ├── useMCP.ts                # MCP client (initialize, tools/list)
│   │   └── useTools.ts              # Tools from MCP via useMCP
│   ├── lib/
│   │   ├── api.ts                   # API client
│   │   └── auth.ts                  # OAuth PKCE flow
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

**Dependencies:**
- React 18
- Vite (build tool)
- Tailwind CSS
- shadcn/ui components
- react-markdown (with rehype-highlight for code)
- oauth4webapi (for PKCE flow)

### Backend (`src/api/`)

```
src/api/
├── router.ts          # Express router for /api/*
├── chat-handler.ts    # POST /api/chat SSE streaming
├── cancel-handler.ts  # POST /api/cancel
└── auth-middleware.ts # OAuth 2.1 token validation
```

**Integration with existing server:**
- Mount API router on Express app alongside existing MCP endpoints
- UI calls `POST /mcp` directly for `tools/list` (standard MCP protocol)
- Agent chat handler uses internal MCP client for tool execution
- Share LLM provider configuration from environment

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for LLM access |
| `MCP_CURSOR_SECRET` | Yes | HMAC key for MCP pagination (existing) |
| `MCP_PORT` | No | HTTP port (default: 3000) |
| `MCP_HOST` | No | Bind address (default: 0.0.0.0) |

**LLM Configuration** (in `src/client/llm-provider.ts`):
- Provider: OpenRouter
- Model: `google/gemini-2.5-flash-lite`
- Streaming: Enabled
- Tool calling: Enabled

---

## UI Components

### Chat View

```
┌─────────────────────────────────────────────────────────────────┐
│  MCP Agent Chat                                    [Tools ▼]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ User: What is 15 * 7?                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Assistant: Let me calculate that for you.                │   │
│  │                                                          │   │
│  │ The result of 15 × 7 is **105**.                        │   │
│  │                                                          │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ 🔧 Tool: calculate                              [▼] │ │   │
│  │ │ Input: { "operation": "multiply", "a": 15, "b": 7 } │ │   │
│  │ │ Output: { "result": 105, "expression": "15 * 7" }   │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ User: Now roll 2d6+3                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Assistant: Rolling 2d6+3...█                            │   │  ← Streaming
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐ [Cancel] │
│  │ Type a message...                                 │  [Send] │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Tools Panel (Sidebar)

```
┌──────────────────────────────┐
│ Available Tools              │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ 🧮 calculate             │ │
│ │ Perform arithmetic       │ │
│ │ operations               │ │
│ │                          │ │
│ │ Parameters:              │ │
│ │ • operation: string      │ │
│ │ • a: number              │ │
│ │ • b: number              │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 🎲 roll_dice             │ │
│ │ Roll dice using          │ │
│ │ standard notation        │ │
│ │                          │ │
│ │ Parameters:              │ │
│ │ • notation: string       │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 🔮 tell_fortune          │ │
│ │ Get a random fortune     │ │
│ │                          │ │
│ │ Parameters:              │ │
│ │ • category?: string      │ │
│ │ • mood?: string          │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### Message Components

**UserMessage**: Simple bubble with user text, right-aligned, distinct background

**AssistantMessage**:
- Markdown-rendered content
- Streaming cursor (█) during generation
- Tool calls displayed below (collapsed by default)

**ToolCall** (expandable):
- Collapsed: `🔧 Tool: calculate [▼]`
- Expanded: Shows input JSON and output JSON with syntax highlighting

---

## API Design

### MCP Protocol Endpoints (Existing)

The UI uses the existing MCP HTTP transport directly for protocol operations:

**POST /mcp** - JSON-RPC 2.0 endpoint for all MCP operations

```typescript
// Initialize session
{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-11-25", "clientInfo": { "name": "agent-ui", "version": "1.0.0" }, "capabilities": {} } }

// List available tools
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }

// Response contains tool definitions with schemas
{ "jsonrpc": "2.0", "id": 2, "result": { "tools": [...] } }
```

**GET /mcp** - SSE stream for server-initiated messages (progress, notifications)

### Chat API (New)

The chat endpoint orchestrates LLM + MCP tool execution (this is the "agent" layer, not MCP protocol):

**POST /api/chat** - Start chat with streaming response

**Request:**
```typescript
{
  message: string;           // User message
  sessionId?: string;        // MCP session ID (reuse existing)
}
```

**Response:** SSE stream with events:

```typescript
// Token event - streamed LLM text chunk
event: token
data: {"content": "Let me "}

// Tool call event - agent invoking MCP tool
event: tool_call
data: {"name": "calculate", "args": {"operation": "multiply", "a": 15, "b": 7}}

// Tool result event - MCP tool completed
event: tool_result
data: {"name": "calculate", "result": {"result": 105, "expression": "15 * 7"}}

// Done event - generation complete
event: done
data: {"usage": {"promptTokens": 150, "completionTokens": 45, "totalTokens": 195}}

// Error event - something went wrong
event: error
data: {"code": "rate_limit", "message": "Too many requests"}
```

**Headers:**
- `Content-Type: text/event-stream`
- `Authorization: Bearer <oauth_token>`
- `mcp-session-id: <session>` (returned, for reuse)

### POST /api/cancel

Abort an in-progress generation.

**Request:**
```typescript
{
  conversationId: string;
}
```

**Response:**
```typescript
{
  cancelled: boolean;
}
```

---

## Authentication

Integrate with existing MCP OAuth 2.1 implementation using PKCE flow.

### Flow

1. User clicks "Login" in UI
2. Frontend initiates PKCE flow:
   - Generate `code_verifier` and `code_challenge`
   - Redirect to `/oauth/authorize?response_type=code&code_challenge=...`
3. User authenticates (if not already)
4. Redirect back to UI with authorization code
5. Frontend exchanges code for tokens via `/oauth/token`
6. Store access token in memory (session storage)
7. Include `Authorization: Bearer <token>` in all API requests

### Token Refresh

- Access tokens expire (configurable, default 1 hour)
- Use refresh token to obtain new access token
- On 401, attempt refresh before prompting re-login

### Backend Validation

```typescript
// src/api/auth-middleware.ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  // Validate token with existing OAuth implementation
  const valid = validateAccessToken(token);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  next();
}
```

---

## Data Flow

### Chat Message Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  BROWSER                                         │
│                                                                                  │
│  User types message                                                              │
│         │                                                                        │
│         ▼                                                                        │
│  ┌──────────────┐                                                               │
│  │ MessageInput │                                                               │
│  │ onSubmit()   │                                                               │
│  └──────┬───────┘                                                               │
│         │                                                                        │
│         ▼                                                                        │
│  ┌──────────────┐                                                               │
│  │   useChat    │◀──────────────────────────────────┐                           │
│  │   hook       │    SSE events (token, tool_call,  │                           │
│  └──────┬───────┘    tool_result, done)             │                           │
│         │                                            │                           │
│         │ POST /api/chat                             │                           │
└─────────┼────────────────────────────────────────────┼───────────────────────────┘
          │                                            │
          ▼                                            │
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Node.js)                                   │
│                                                                                  │
│  ┌──────────────┐                                                               │
│  │ chat-handler │                                                               │
│  │ (Express)    │                                                               │
│  └──────┬───────┘                                                               │
│         │                                                                        │
│         ▼                                                                        │
│  ┌───────────────────────────────────────────────────────────────────┐          │
│  │                 Agent (src/client/agent.ts)                        │          │
│  │  ┌─────────────────────────────────────────────────────────────┐  │          │
│  │  │  generateText() - Vercel AI SDK                             │  │          │
│  │  │    • messages: [system, user, assistant...]                 │  │          │
│  │  │    • tools: MCP tools converted to AI SDK format            │  │          │
│  │  │    • onStepFinish: callback for streaming ──────────────────┼──┼──────────┘
│  │  └─────────────────┬───────────────────────────────────────────┘  │
│  │                    │                                               │
│  └────────────────────┼───────────────────────────────────────────────┘
│                       │
│         ┌─────────────┴─────────────┐
│         │                           │
│         ▼                           ▼
│  ┌──────────────────┐      ┌────────────────────────────┐
│  │   LLM Provider   │      │   MCP Server (embedded)    │
│  │ (llm-provider.ts)│      │   POST /mcp (tools/call)   │
│  └────────┬─────────┘      └────────────────────────────┘
│           │                           ▲
│           │                           │ JSON-RPC
│           │                           │ tools/call
│           │                           │
└───────────┼───────────────────────────┘
            │
            │ HTTPS (streaming)
            ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           OPENROUTER API                                          │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                    google/gemini-2.5-flash-lite                             │  │
│  │  - Receives: system prompt + conversation history + tool definitions       │  │
│  │  - Generates: text tokens (streamed) + tool_call decisions                 │  │
│  │  - Returns: SSE stream of completion chunks                                │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Tool Execution Flow (Detail)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Agent receives tool_call from LLM                                               │
│         │                                                                        │
│         ▼                                                                        │
│  ┌────────────────────────────────────────┐                                     │
│  │  tools-adapter.ts                       │                                     │
│  │  mcpToolToAiTool() execute callback    │                                     │
│  └────────────────┬───────────────────────┘                                     │
│                   │                                                              │
│                   ▼                                                              │
│  ┌────────────────────────────────────────┐                                     │
│  │  MCPClient.callTool()                   │                                     │
│  │  JSON-RPC: tools/call                   │                                     │
│  └────────────────┬───────────────────────┘                                     │
│                   │                                                              │
│                   ▼                                                              │
│  ┌────────────────────────────────────────┐      ┌────────────────────────────┐ │
│  │  MCP Server (HTTP Transport)            │      │  Tool Registry             │ │
│  │  POST /mcp                              │─────▶│  • CalculatorTool          │ │
│  │  mcp-session-id: <session>             │      │  • DiceRollerTool          │ │
│  └────────────────────────────────────────┘      │  • FortuneTellerTool       │ │
│                   │                              └────────────────────────────┘ │
│                   ▼                                                              │
│  ┌────────────────────────────────────────┐                                     │
│  │  Tool result returned to Agent          │                                     │
│  │  → Sent to LLM as tool_result          │                                     │
│  │  → SSE: tool_result sent to frontend   │                                     │
│  └────────────────────────────────────────┘                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Cancellation Flow

```
User clicks Cancel
       │
       ▼
┌──────────────┐
│ MessageInput │
│ onCancel()   │
└──────┬───────┘
       │
       ▼
┌──────────────┐   POST /api/cancel   ┌────────────────┐
│   useChat    │ ─────────────────▶   │ cancel-handler │
│   abort()    │                      │                │
└──────────────┘                      └───────┬────────┘
                                              │
                                              ▼
                                      ┌────────────────┐
                                      │ AbortController│
                                      │    .abort()    │
                                      └───────┬────────┘
                                              │
                                              ▼
                                      ┌────────────────┐
                                      │  generateText  │
                                      │  (interrupted) │
                                      └────────────────┘
```

---

## Error Handling

### Frontend Errors

| Error | User Message | Recovery |
|-------|--------------|----------|
| Network failure | "Connection lost. Retrying..." | Auto-retry with backoff |
| 401 Unauthorized | "Session expired. Please log in." | Redirect to login |
| 429 Rate limit | "Too many requests. Please wait." | Show retry timer |
| 500 Server error | "Something went wrong. Try again." | Show retry button |
| SSE disconnect | "Connection interrupted." | Auto-reconnect |

### Backend Errors

| Scenario | Status | Response |
|----------|--------|----------|
| Invalid message | 400 | `{"error": "Message is required"}` |
| Not authenticated | 401 | `{"error": "Missing authorization"}` |
| Token expired | 401 | `{"error": "Token expired"}` |
| Rate limited | 429 | `{"error": "Rate limit exceeded", "retryAfter": 60}` |
| LLM API error | 502 | `{"error": "LLM service unavailable"}` |
| MCP tool error | 200 | Tool result contains error (normal flow) |

---

## Implementation Plan

### Phase 1: Foundation (1-2 days)

1. **Set up packages/ui structure**
   - Initialize Vite + React + TypeScript
   - Configure Tailwind CSS
   - Add shadcn/ui components

2. **Create backend API router**
   - Mount `/api/*` routes on Express
   - Implement `/api/health` endpoint
   - Add auth middleware (can stub initially)

3. **Basic chat UI**
   - MessageInput component
   - MessageList component
   - Static message display (no streaming yet)

### Phase 2: Core Chat (2-3 days)

4. **Implement POST /api/chat**
   - Integrate with Agent
   - SSE streaming response
   - Token, tool_call, tool_result events

5. **SSE handling in frontend**
   - useSSE hook
   - Streaming text display
   - Tool call rendering

6. **MCP client integration in UI**
   - useMCP hook for `initialize` and `tools/list`
   - Proper session management with `mcp-session-id`
   - Tools panel UI

### Phase 3: Polish (1-2 days)

7. **Cancellation support**
   - AbortController integration
   - Cancel button UI

8. **OAuth integration**
   - PKCE flow implementation
   - Token storage and refresh
   - Login/logout UI

9. **Error handling**
   - Error boundaries
   - Retry logic
   - User-friendly messages

### Phase 4: Testing & Documentation (1 day)

10. **Tests**
    - Component tests (Vitest + Testing Library)
    - API integration tests
    - E2E flow test

11. **Documentation**
    - README for packages/ui
    - API documentation
    - Deployment guide

---

## Open Questions

| Question | Options | Decision Needed By |
|----------|---------|-------------------|
| Should tools panel be always visible or toggle? | Always / Toggle / Responsive | Phase 1 |
| Max conversation length before warning? | 10 / 20 / Unlimited | Phase 2 |
| Should we show token usage to users? | Yes / No / Optional setting | Phase 3 |
| Dark mode support in MVP? | Yes / No | Phase 1 |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-19 | OpenRouter + google/gemini-2.5-flash-lite | Fast, affordable, good tool calling; existing llm-provider.ts integration |
| 2026-01-19 | Use SSE over WebSocket | MCP 2025-11-25 spec uses SSE; simpler implementation |
| 2026-01-19 | Session-only state | MVP scope; database adds complexity |
| 2026-01-19 | Server-side LLM keys | Security best practice; OPENROUTER_API_KEY in env |
| 2026-01-19 | Monorepo (packages/ui) | Shared types, single deployment |
| 2026-01-19 | Tool calls below message | Cleaner UX than inline; easy to expand |
| 2026-01-19 | UI calls MCP protocol directly | Reference implementation; no duplicate /api/tools endpoint |
