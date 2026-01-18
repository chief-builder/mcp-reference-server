# MCP Client Agent Specification (2025-11-25)
AI agent hosting MCP client using `@modelcontextprotocol/sdk` + Vercel AI SDK.

---
## Phase 1: Core Client + AI Agent
### Dependencies
1. **MCP**: `@modelcontextprotocol/sdk` (includes client) + `zod`
2. **AI SDK**: `ai` + `@openrouter/ai-sdk-provider` (free default) + `@ai-sdk/anthropic` (optional)
3. **CLI**: `commander` + `chalk` for minimal terminal UI
### Transport
4. **StdioClientTransport**: `{ command, args, env }` - spawn local server subprocess
5. **StreamableHTTPClientTransport**: `new URL(serverUrl)` - connect to remote server
### LLM Configuration
6. **Default**: OpenRouter free - `google/gemini-2.0-flash-exp:free` or `deepseek/deepseek-chat:free`
7. **Optional**: Anthropic `claude-3-haiku-20240307` if `ANTHROPIC_API_KEY` set
8. **Fallback**: Auto-detect available API key, prefer free tier for learning
### Agent Loop (Vercel AI SDK)
9. **Tool Discovery**: `client.listTools()` → convert to AI SDK tool format
10. **Generate**: `generateText({ model, tools, prompt })` with tool loop
11. **Execute**: On tool_call → `client.callTool({ name, arguments })`
12. **Iterate**: Return results to LLM until final response (max 10 steps)
### Server Feature Consumption
13. **Tools**: `listTools()` with pagination, `callTool()` with progress
14. **Completions**: `client.complete()` for argument auto-complete
15. **Logging**: `client.setLoggingLevel()` to control verbosity
### CLI Interface
16. **Commands**: `connect <server>`, `chat`, `tools`, `call <name> <args>`
17. **REPL**: Interactive chat mode with tool-augmented responses
18. **Learning Mode**: `--verbose` flag shows JSON-RPC messages

### Implementation
Add `src/client/`: agent.ts, mcp-client.ts, llm-provider.ts, tools-adapter.ts, cli.ts

---
## Phase 2: Advanced Features (Future)
19. **Roots/Sampling/Elicitation**: Client capabilities for server requests
20. **Resources/Prompts**: Additional server feature consumption
21. **Ink TUI**: Rich terminal UI for human-in-the-loop approval
