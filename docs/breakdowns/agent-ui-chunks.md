# Agent UI - Implementation Chunks

**Spec**: `docs/specs/agent-ui.md`
**Architecture**: N/A (decisions documented in spec)
**Created**: 2026-01-19
**Approach**: Vertical (end-to-end slices)
**Beads**: Integrated (use /auto to implement)

## Progress

- [ ] Phase 1: Foundation (2 chunks)
- [ ] Phase 2: Core Features (3 chunks)
- [ ] Phase 3: Polish (2 chunks)

---

## Phase 1: Foundation

### [ ] CHUNK-01: Project Setup & Backend API Router
**Goal**: Set up packages/ui with Vite+React+TypeScript+Tailwind+shadcn and create backend API router scaffolding

**Done When**:
- [ ] `packages/ui/` directory exists with Vite+React+TypeScript configuration
- [ ] Tailwind CSS configured in packages/ui with tailwind.config.ts
- [ ] shadcn/ui initialized (at minimum: Button, Input, Card components)
- [ ] packages/ui/src/App.tsx renders "MCP Agent Chat" placeholder
- [ ] `npm run dev` in packages/ui starts dev server on port 5173
- [ ] `src/api/router.ts` created with Express router mounted on `/api/*`
- [ ] `GET /api/health` returns `{ status: "ok" }`
- [ ] Health endpoint accessible when server starts
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads

**Scope**:
- packages/ui/* (new directory)
- src/api/router.ts (new)
- src/transport/http.ts (mount API router)

**Size**: L (half-day)
**Risk**: None - standard setup
**Beads**: #MCP_11252025_Reference-1hb

---

### [ ] CHUNK-02: Basic Chat UI Components
**Goal**: Create MessageInput, MessageList, UserMessage, AssistantMessage components with static display

**Done When**:
- [ ] MessageInput component in packages/ui/src/components/chat/MessageInput.tsx
- [ ] MessageInput has text input field and Send button
- [ ] MessageList component in packages/ui/src/components/chat/MessageList.tsx
- [ ] MessageList scrolls to bottom when new messages added
- [ ] UserMessage component displays user text right-aligned with distinct background
- [ ] AssistantMessage component displays markdown-rendered content
- [ ] ChatView component integrates all components in packages/ui/src/components/chat/ChatView.tsx
- [ ] Static messages can be displayed (hardcoded test messages work)
- [ ] packages/ui/src/hooks/useChat.ts manages message state (add message, clear)
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads

**Scope**:
- packages/ui/src/components/chat/*.tsx
- packages/ui/src/hooks/useChat.ts

**Size**: L (half-day)
**Risk**: None
**Beads**: #MCP_11252025_Reference-ty7

---

## Phase 2: Core Features

### [ ] CHUNK-03: MCP Client Integration & Tools Panel
**Goal**: Create useMCP hook for initialize/tools/list and Tools panel UI

**Done When**:
- [ ] packages/ui/src/hooks/useMCP.ts created with initialize() and listTools() functions
- [ ] useMCP calls POST /mcp with proper headers (mcp-protocol-version, mcp-session-id)
- [ ] useMCP stores and reuses mcp-session-id from initialize response
- [ ] packages/ui/src/hooks/useTools.ts fetches tools via useMCP and returns tool list
- [ ] ToolsPanel component in packages/ui/src/components/tools/ToolsPanel.tsx
- [ ] ToolCard component displays tool name, description, and parameter schema
- [ ] Tools panel shows calculate, roll_dice, tell_fortune tools from server
- [ ] Tools panel can be toggled visible/hidden in ChatView
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads

**Scope**:
- packages/ui/src/hooks/useMCP.ts (new)
- packages/ui/src/hooks/useTools.ts (new)
- packages/ui/src/components/tools/*.tsx (new)
- packages/ui/src/lib/api.ts (new - API client)

**Size**: L (half-day)
**Risk**: MCP session management complexity
**Beads**: #MCP_11252025_Reference-y1i
**Depends on**: CHUNK-01 (API router must exist)

---

### [ ] CHUNK-04: Chat API with SSE Streaming
**Goal**: Implement POST /api/chat with SSE streaming, integrate Agent, create useSSE hook

**Done When**:
- [ ] src/api/chat-handler.ts created with POST /api/chat endpoint
- [ ] chat-handler integrates with Agent class from src/client/agent.ts
- [ ] chat-handler returns SSE stream (Content-Type: text/event-stream)
- [ ] SSE emits `token` events for streamed LLM text chunks
- [ ] SSE emits `tool_call` events when agent calls MCP tools
- [ ] SSE emits `tool_result` events with tool execution results
- [ ] SSE emits `done` event with usage stats when complete
- [ ] SSE emits `error` event on failure
- [ ] packages/ui/src/hooks/useSSE.ts handles EventSource connection
- [ ] useChat.ts updated to use useSSE for message streaming
- [ ] AssistantMessage shows streaming cursor (█) during generation
- [ ] Typed text appears word-by-word as tokens arrive
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads

**Scope**:
- src/api/chat-handler.ts (new)
- src/api/router.ts (add chat route)
- packages/ui/src/hooks/useSSE.ts (new)
- packages/ui/src/hooks/useChat.ts (update)
- packages/ui/src/components/chat/AssistantMessage.tsx (streaming support)

**Size**: L (half-day)
**Risk**: SSE streaming complexity, Agent integration
**Beads**: #MCP_11252025_Reference-49c
**Depends on**: CHUNK-01 (API router), CHUNK-02 (chat components)

---

### [ ] CHUNK-05: Tool Calls Display & Cancellation
**Goal**: Show tool calls in UI with expand/collapse, implement cancel functionality

**Done When**:
- [ ] ToolCall component in packages/ui/src/components/chat/ToolCall.tsx
- [ ] ToolCall displays collapsed: "🔧 Tool: {name} [▼]"
- [ ] ToolCall expanded shows input JSON and output JSON with syntax highlighting
- [ ] Tool calls appear below AssistantMessage during/after generation
- [ ] tool_call SSE events render ToolCall components in-flight
- [ ] tool_result SSE events update ToolCall with results
- [ ] src/api/cancel-handler.ts created with POST /api/cancel
- [ ] cancel-handler uses AbortController to stop in-progress generation
- [ ] Cancel button appears in MessageInput during active generation
- [ ] Clicking Cancel calls /api/cancel and stops streaming
- [ ] Cancelled generation shows partial response
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads

**Scope**:
- packages/ui/src/components/chat/ToolCall.tsx (new)
- packages/ui/src/components/chat/AssistantMessage.tsx (integrate tool calls)
- src/api/cancel-handler.ts (new)
- src/api/router.ts (add cancel route)
- packages/ui/src/hooks/useChat.ts (cancel support)
- packages/ui/src/components/chat/MessageInput.tsx (cancel button)

**Size**: L (half-day)
**Risk**: AbortController integration with streaming
**Beads**: #MCP_11252025_Reference-bin
**Depends on**: CHUNK-04 (streaming must work first)

---

## Phase 3: Polish

### [ ] CHUNK-06: OAuth Integration
**Goal**: Implement PKCE flow in frontend, auth middleware on backend, Login/Logout UI

**Done When**:
- [ ] packages/ui/src/lib/auth.ts implements PKCE flow using oauth4webapi
- [ ] auth.ts generates code_verifier and code_challenge
- [ ] auth.ts redirects to /oauth/authorize with proper parameters
- [ ] auth.ts handles callback and exchanges code for tokens
- [ ] Access token stored in sessionStorage (memory only)
- [ ] src/api/auth-middleware.ts validates Bearer tokens on /api/* routes
- [ ] auth-middleware returns 401 for missing/invalid tokens
- [ ] Login button shows when not authenticated
- [ ] Login redirects through OAuth flow
- [ ] Logout button clears tokens and state
- [ ] Authorization: Bearer token included in all /api/* requests
- [ ] Token refresh attempted on 401 before prompting re-login
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads

**Scope**:
- packages/ui/src/lib/auth.ts (new)
- src/api/auth-middleware.ts (new)
- src/api/router.ts (apply auth middleware)
- packages/ui/src/App.tsx (auth state, login/logout UI)
- packages/ui/src/lib/api.ts (add auth headers)

**Size**: L (half-day)
**Risk**: OAuth complexity, existing server integration
**Beads**: #MCP_11252025_Reference-d43
**Depends on**: CHUNK-04 (chat API must exist to protect)

---

### [ ] CHUNK-07: Error Handling & Final Polish
**Goal**: Add error boundaries, retry logic, user-friendly messages, responsive design

**Done When**:
- [ ] Error boundary component catches React errors gracefully
- [ ] Network failure shows "Connection lost. Retrying..." with auto-retry
- [ ] 401 errors redirect to login with "Session expired" message
- [ ] 429 rate limit shows retry timer countdown
- [ ] 500 errors show "Something went wrong" with retry button
- [ ] SSE disconnect triggers auto-reconnect
- [ ] Chat input disabled during loading states
- [ ] Empty state shows helpful prompt suggestions
- [ ] Responsive design works on mobile (sidebar hidden, full-width chat)
- [ ] Loading spinners for all async operations
- [ ] react-markdown configured with rehype-highlight for code blocks
- [ ] Build produces production bundle with no errors
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads

**Scope**:
- packages/ui/src/components/ErrorBoundary.tsx (new)
- packages/ui/src/hooks/useSSE.ts (reconnect logic)
- packages/ui/src/hooks/useChat.ts (error states)
- packages/ui/src/components/chat/*.tsx (loading/error states)
- packages/ui/src/App.tsx (error boundary wrapper)
- packages/ui/tailwind.config.ts (responsive breakpoints)

**Size**: L (half-day)
**Risk**: None - polish work
**Beads**: #MCP_11252025_Reference-r6d
**Depends on**: CHUNK-05, CHUNK-06 (all features must exist to polish)

---

## Dependency Graph

```
CHUNK-01 (Foundation)
    │
    ├───────────────────────┐
    ▼                       ▼
CHUNK-02 (Chat UI)    CHUNK-03 (MCP/Tools)
    │                       │
    └───────────┬───────────┘
                ▼
          CHUNK-04 (Streaming)
                │
                ▼
          CHUNK-05 (Tools Display + Cancel)
                │
                ├───────────────────────┐
                ▼                       ▼
          CHUNK-06 (OAuth)        (parallel ok)
                │
                └───────────┬───────────┘
                            ▼
                      CHUNK-07 (Polish)
```

## Discovered During Implementation

*(Items discovered while implementing will be added here)*

## Notes

- UI calls POST /mcp directly for MCP protocol operations (tools/list)
- Agent chat goes through POST /api/chat (separate from MCP protocol)
- Session-only state (no database) - tokens in sessionStorage, messages in React state
- Server-side LLM keys only (OPENROUTER_API_KEY in env)
- Tools panel design: toggle button in header (responsive-friendly)
