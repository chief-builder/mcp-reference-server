# MCP Reference Server Testing Guide

> Comprehensive guide for testing the MCP Reference Server, including E2E test results, manual testing procedures, and troubleshooting.

**Target Audience**: Developers integrating MCP clients and Contributors/Maintainers
**Last Updated**: 2026-01-18
**MCP Protocol Version**: 2025-11-25

---

## Table of Contents

1. [Overview](#overview)
2. [E2E Test Results](#e2e-test-results)
3. [Prerequisites](#prerequisites)
4. [Manual Testing: HTTP Transport](#manual-testing-http-transport)
5. [Manual Testing: Stdio Transport](#manual-testing-stdio-transport)
6. [Testing Built-in Tools](#testing-built-in-tools)
7. [Error Scenarios](#error-scenarios)
8. [Session Management Testing](#session-management-testing)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The MCP Reference Server is a production-quality implementation of the Model Context Protocol (MCP) targeting the 2025-11-25 specification. It supports two transports:

- **HTTP Transport**: RESTful endpoint with optional session management and SSE
- **Stdio Transport**: Newline-delimited JSON over stdin/stdout

### Architecture Summary

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Client    │────▶│  Transport Layer │────▶│  MessageRouter  │
│ (HTTP/Stdio)│     │  (HTTP or Stdio) │     │  (JSON-RPC 2.0) │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
        ┌─────────────────────────────────────────────┼─────────────────────┐
        ▼                    ▼                        ▼                     ▼
┌───────────────┐  ┌─────────────────┐  ┌────────────────────┐  ┌──────────────┐
│LifecycleManager│  │  ToolExecutor   │  │ CompletionHandler  │  │LoggingHandler│
│ (init/ready)   │  │ (tools/call)    │  │(completion/complete)│  │(logging/*)   │
└───────────────┘  └─────────────────┘  └────────────────────┘  └──────────────┘
                           │
                           ▼
                   ┌───────────────┐
                   │  ToolRegistry │
                   │  (3 tools)    │
                   └───────────────┘
```

### Built-in Tools

| Tool | Description | Input Schema |
|------|-------------|--------------|
| `calculate` | Basic arithmetic (add, subtract, multiply, divide) | `{operation, a, b}` |
| `roll_dice` | Dice notation parser (e.g., 2d6+3) | `{notation}` |
| `tell_fortune` | Random fortune generator with categories | `{category?, mood?}` |

---

## E2E Test Results

### Test Execution Summary (2026-01-18)

**Test Framework**: Vitest 2.1.9
**Total Tests**: 72
**Duration**: ~49s

| Status | Count | Percentage |
|--------|-------|------------|
| Passed | 72 | 100% |
| Failed | 0 | 0% |
| Skipped | 0 | 0% |

### How to Run E2E Tests

```bash
npm run test:e2e
```

**Important**: Run this command directly in your terminal. Some IDE sandbox environments (including Claude Code) restrict network port binding, which will cause HTTP transport tests to fail with `EPERM` errors.

### Test Suites Breakdown

#### 1. Smoke Tests (`test/e2e/smoke.e2e.ts`) - 7 tests
- HTTP: Server starts and accepts initialize request
- HTTP: Server responds to tools/list
- HTTP: Server responds to tools/call
- Stdio: Server starts and accepts initialize request
- Stdio: Server responds to tools/list
- Stdio: Server responds to tools/call

#### 2. Initialization Workflow (`test/e2e/workflows/initialization.e2e.ts`) - 7 tests
- HTTP/Stdio: connects and initializes with correct protocol version
- Protocol version mismatch returns error
- Client can call tools/list after successful initialization
- Multiple concurrent clients initialize without interference

#### 3. Tool Execution (`test/e2e/workflows/tool-execution.e2e.ts`) - 13 tests
- tools/list returns array of tool definitions
- tools/call with valid input returns content array
- tools/call with invalid arguments returns error -32602
- tools/call for unknown tool returns error -32601
- Calculator operations (add, subtract, multiply, divide)

#### 4. Session Management (`test/e2e/workflows/session-management.e2e.ts`) - 10 tests
- First request creates session with Mcp-Session-Id header
- Subsequent requests with same session ID reuse state
- Invalid session ID returns appropriate error
- Multiple concurrent requests on same session don't corrupt state
- Stdio transport works without session management

#### 5. Graceful Shutdown (`test/e2e/workflows/shutdown.e2e.ts`) - 5 tests
- SIGTERM with no in-flight requests causes clean exit (code 0)
- SIGTERM during in-flight request waits for completion
- New requests during shutdown receive 503 or connection refused
- SIGKILL forces immediate termination

#### 6. Cross-Transport Consistency (`test/e2e/transports/cross-transport.e2e.ts`) - 15 tests
- Same initialize request produces equivalent response on both transports
- Same tools/list request produces identical tool list on both transports
- Same tools/call request produces identical result on both transports
- Same invalid request produces equivalent error on both transports

#### 7. Error Handling (`test/e2e/scenarios/error-handling.e2e.ts`) - 15 tests
- Invalid JSON body returns parse error
- Unknown method returns method not found error -32601
- Request before initialization returns error
- Malformed JSON-RPC (missing jsonrpc field) returns -32600
- Malformed JSON-RPC (missing id for request) returns -32600

#### 8. Agent E2E Tests (`test/e2e/agent.e2e.ts`) - 7 tests (requires LLM API key)

These tests use a real LLM provider to test the full agent workflow. They are **skipped automatically** if no API key is set.

```bash
# Run with OpenRouter (free tier available)
OPENROUTER_API_KEY=sk-or-... npm run test:e2e -- --run test/e2e/agent.e2e.ts

# Run with Anthropic (recommended - better rate limits)
ANTHROPIC_API_KEY=sk-ant-... npm run test:e2e -- --run test/e2e/agent.e2e.ts
```

| Test | Description | Timeout |
|------|-------------|---------|
| Calculator tool | Verifies LLM calls calculate tool for math | 60s |
| Dice roller tool | Verifies LLM calls roll_dice for dice notation | 60s |
| Fortune teller tool | Verifies LLM calls tell_fortune with params | 60s |
| Multi-turn conversation | Tests conversation context across turns | 120s |
| Division by zero | Tests error handling for tool errors | 60s |
| Invalid tool args | Tests graceful handling of invalid args | 60s |
| Multi-tool workflow | Tests sequential tool execution | 90s |

### Troubleshooting: Sandbox EPERM Errors

If you see errors like:
```
EPERM: operation not permitted 127.0.0.1:<port>
```

This means you're running in a sandboxed environment that restricts network port binding.

**Solution**: Run tests directly in your terminal, not through an IDE sandbox:
```bash
cd /path/to/MCP_11252025_Reference
npm run test:e2e
```

### Known Issues from Beads

| Issue ID | Title | Priority | Type |
|----------|-------|----------|------|
| `3lf` | HTTP-only server mode doesn't exit after SIGTERM | P2 | Bug |
| `trd` | Duplicate of 3lf | P2 | Chore |
| `uop` | HTTP transport requires mcp-protocol-version header | P2 | Bug |
| `881` | Add slow_operation tool for timeout testing | P3 | Chore |
| `afx` | Server requires MCP_CURSOR_SECRET env var for E2E | P3 | Chore |
| `pgt` | Consider -32602 for protocol version mismatch | P3 | Chore |
| `uso` | Parse errors return HTML instead of JSON-RPC -32700 | P3 | Chore |

---

## Prerequisites

### Environment Setup

```bash
# Clone and install
git clone <repository>
cd MCP_11252025_Reference
npm install

# Build (required before running)
npm run build

# Create .env from example
cp .env.example .env

# Generate cursor secret (required)
export MCP_CURSOR_SECRET=$(openssl rand -base64 32)
# Or add to .env file
```

### Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_CURSOR_SECRET` | **Yes** | - | HMAC key for pagination (min 32 chars) |
| `MCP_PORT` | No | 3000 | HTTP listen port |
| `MCP_HOST` | No | 0.0.0.0 | HTTP bind address |
| `MCP_TRANSPORT` | No | both | `stdio`, `http`, or `both` |

### Start the Server

```bash
# HTTP only (default port 3000)
MCP_TRANSPORT=http MCP_CURSOR_SECRET=$(openssl rand -base64 32) npm run dev

# Custom port
MCP_PORT=8080 MCP_TRANSPORT=http MCP_CURSOR_SECRET=$(openssl rand -base64 32) npm run dev

# Stdio only
MCP_TRANSPORT=stdio MCP_CURSOR_SECRET=$(openssl rand -base64 32) npm run dev

# Both transports
MCP_TRANSPORT=both MCP_CURSOR_SECRET=$(openssl rand -base64 32) npm run dev
```

**Expected Output**:
```
MCP Reference Server started
  Transport: http
  HTTP: http://0.0.0.0:3000
  Tools: 3 registered
```

---

## Manual Testing: HTTP Transport

All HTTP requests require these headers:
- `Content-Type: application/json`
- `mcp-protocol-version: 2025-11-25`

### Step 1: Initialize Connection

Use `-i` flag to see response headers (the session ID is in headers, not body):

```bash
curl -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {
        "name": "manual-test-client",
        "version": "1.0.0"
      }
    }
  }'
```

**Expected Response** (headers + body):
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
mcp-session-id: 0a0214bb-2bf7-442b-b2bc-966254b7e186   <-- SAVE THIS!
...

{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25",...}}
```

**One-liner to capture session ID:**
```bash
SESSION_ID=$(curl -s -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    }
  }' | grep -i "mcp-session-id" | cut -d' ' -f2 | tr -d '\r')

echo "Session ID: $SESSION_ID"
```

### Step 2: Send Initialized Notification

```bash
# Use the SESSION_ID captured above
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  }'
```

**Expected Response**: Empty body (HTTP 200, notifications don't return JSON-RPC results)

### Step 3: List Available Tools

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

**Expected Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "calculate",
        "description": "Perform basic arithmetic operations",
        "inputSchema": {
          "type": "object",
          "properties": {
            "operation": { "type": "string", "enum": ["add", "subtract", "multiply", "divide"] },
            "a": { "type": "number" },
            "b": { "type": "number" }
          },
          "required": ["operation", "a", "b"]
        }
      },
      {
        "name": "roll_dice",
        "description": "Roll dice using standard notation",
        "inputSchema": {
          "type": "object",
          "properties": {
            "notation": { "type": "string" }
          },
          "required": ["notation"]
        }
      },
      {
        "name": "tell_fortune",
        "description": "Get a random fortune",
        "inputSchema": {
          "type": "object",
          "properties": {
            "category": { "type": "string", "enum": ["love", "career", "health", "wealth", "general"] },
            "mood": { "type": "string", "enum": ["optimistic", "mysterious", "cautious"] }
          }
        }
      }
    ]
  }
}
```

### Step 4: Call a Tool

#### Calculator - Addition
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "calculate",
      "arguments": {
        "operation": "add",
        "a": 15,
        "b": 27
      }
    }
  }'
```

**Expected Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "42"
      }
    ]
  }
}
```

#### Dice Roller
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "roll_dice",
      "arguments": {
        "notation": "2d6+3"
      }
    }
  }'
```

**Expected Response** (values will vary):
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Rolling 2d6+3: [4, 2] + 3 = 9"
      }
    ]
  }
}
```

#### Fortune Teller
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "tell_fortune",
      "arguments": {
        "category": "career",
        "mood": "optimistic"
      }
    }
  }'
```

**Expected Response** (text will vary):
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Your career fortune: Great opportunities await those who prepare..."
      }
    ]
  }
}
```

### Step 5: Test Auto-Completion

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "completion/complete",
    "params": {
      "ref": {
        "type": "ref/tool",
        "name": "tell_fortune"
      },
      "argument": {
        "name": "category",
        "value": "ca"
      }
    }
  }'
```

**Expected Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "completion": {
      "values": ["career"],
      "hasMore": false
    }
  }
}
```

---

## Manual Testing: Stdio Transport

Stdio transport uses newline-delimited JSON (NDJSON) over stdin/stdout.

### Option 1: Interactive Testing with Node

Create a test script `test-stdio.js`:

```javascript
const { spawn } = require('child_process');

const server = spawn('node', ['dist/cli.js'], {
  env: {
    ...process.env,
    MCP_TRANSPORT: 'stdio',
    MCP_CURSOR_SECRET: 'test-secret-at-least-32-characters-long'
  },
  stdio: ['pipe', 'pipe', 'inherit']
});

// Helper to send JSON-RPC message
function send(message) {
  server.stdin.write(JSON.stringify(message) + '\n');
}

// Parse responses
server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(Boolean);
  lines.forEach(line => {
    try {
      console.log('Response:', JSON.parse(line));
    } catch (e) {
      console.log('Raw:', line);
    }
  });
});

// Wait for server to start, then send commands
setTimeout(() => {
  // Initialize
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'stdio-test', version: '1.0.0' }
    }
  });
}, 1000);

setTimeout(() => {
  // Initialized notification
  send({
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  });
}, 1500);

setTimeout(() => {
  // List tools
  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });
}, 2000);

setTimeout(() => {
  // Call calculator
  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'calculate',
      arguments: { operation: 'multiply', a: 7, b: 6 }
    }
  });
}, 2500);

setTimeout(() => {
  server.kill('SIGTERM');
}, 3000);
```

Run with:
```bash
node test-stdio.js
```

### Option 2: Using the MCP SDK Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/cli.js'],
  env: {
    MCP_TRANSPORT: 'stdio',
    MCP_CURSOR_SECRET: 'test-secret-at-least-32-characters-long'
  }
});

const client = new Client({ name: 'test-client', version: '1.0.0' }, {});
await client.connect(transport);

// List tools
const tools = await client.listTools();
console.log('Tools:', tools);

// Call a tool
const result = await client.callTool('calculate', {
  operation: 'add',
  a: 10,
  b: 20
});
console.log('Result:', result);

await client.close();
```

### Option 3: Echo Commands via Pipe

```bash
# Start server and pipe commands
(
  sleep 1
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"pipe-test","version":"1.0.0"}}}'
  sleep 0.5
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  sleep 0.5
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 0.5
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"roll_dice","arguments":{"notation":"1d20"}}}'
  sleep 1
) | MCP_TRANSPORT=stdio MCP_CURSOR_SECRET=$(openssl rand -base64 32) node dist/cli.js
```

---

## Testing Built-in Tools

### Calculator Tool

| Operation | Example Request | Expected Result |
|-----------|-----------------|-----------------|
| add | `{operation: "add", a: 5, b: 3}` | `"8"` |
| subtract | `{operation: "subtract", a: 10, b: 4}` | `"6"` |
| multiply | `{operation: "multiply", a: 7, b: 6}` | `"42"` |
| divide | `{operation: "divide", a: 15, b: 3}` | `"5"` |
| divide by zero | `{operation: "divide", a: 10, b: 0}` | Error: Division by zero |

```bash
# Division by zero test
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 10,
    "method": "tools/call",
    "params": {
      "name": "calculate",
      "arguments": {
        "operation": "divide",
        "a": 10,
        "b": 0
      }
    }
  }'
```

### Dice Roller Tool

| Notation | Description | Valid |
|----------|-------------|-------|
| `1d6` | Roll one 6-sided die | Yes |
| `2d6` | Roll two 6-sided dice | Yes |
| `3d8+5` | Roll 3d8, add 5 | Yes |
| `1d20-2` | Roll 1d20, subtract 2 | Yes |
| `100d6` | Roll 100 dice | Yes (max) |
| `101d6` | Roll 101 dice | Error: Too many dice |
| `1d7` | Invalid die type | Error: Invalid die |

**Valid die types**: d4, d6, d8, d10, d12, d20, d100

```bash
# Test various dice notations
for notation in "1d20" "2d6+3" "4d8-2" "1d100"; do
  echo "Testing: $notation"
  curl -s -X POST http://localhost:3000/mcp \
    -H "Content-Type: application/json" \
    -H "mcp-protocol-version: 2025-11-25" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": 1,
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"roll_dice\",
        \"arguments\": {\"notation\": \"$notation\"}
      }
    }" | jq .
  echo
done
```

### Fortune Teller Tool

| Category | Mood | Description |
|----------|------|-------------|
| love | optimistic | Positive love fortune |
| career | mysterious | Cryptic career advice |
| health | cautious | Health warnings |
| wealth | optimistic | Financial predictions |
| general | any | General fortune |

```bash
# Test all category/mood combinations
for category in love career health wealth general; do
  for mood in optimistic mysterious cautious; do
    echo "Category: $category, Mood: $mood"
    curl -s -X POST http://localhost:3000/mcp \
      -H "Content-Type: application/json" \
      -H "mcp-protocol-version: 2025-11-25" \
      -H "mcp-session-id: $SESSION_ID" \
      -d "{
        \"jsonrpc\": \"2.0\",
        \"id\": 1,
        \"method\": \"tools/call\",
        \"params\": {
          \"name\": \"tell_fortune\",
          \"arguments\": {\"category\": \"$category\", \"mood\": \"$mood\"}
        }
      }" | jq -r '.result.content[0].text'
    echo
  done
done
```

---

## Error Scenarios

### JSON-RPC Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Missing required fields |
| -32601 | Method not found | Unknown method |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Server error |

### Test: Unknown Method (-32601)

**Note**: All error tests require a valid session. Run the initialization steps first to set `$SESSION_ID`.

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "unknown/method",
    "params": {}
  }'
```

**Expected Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found"
  }
}
```

### Test: Unknown Tool (-32601)

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "nonexistent_tool",
      "arguments": {}
    }
  }'
```

### Test: Invalid Tool Arguments (-32602)

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "calculate",
      "arguments": {
        "operation": "invalid_op",
        "a": "not_a_number",
        "b": 5
      }
    }
  }'
```

### Test: Missing Protocol Version Header

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {}
  }'
```

**Expected**: 400 Bad Request (missing mcp-protocol-version header)

### Test: Protocol Version Mismatch

**Note**: This test requires a fresh server restart (no prior sessions). Stop and restart the server first.

```bash
# Restart server first, then run:
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "1999-01-01",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    }
  }'
```

**Expected**: Error response with unsupported protocol version

**If you see "Server already initialized"**: You have an existing session. Restart the server to test this scenario.

---

## Session Management Testing

### Test: Session Creation

```bash
# First request creates a new session
response=$(curl -s -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {"name": "session-test", "version": "1.0.0"}
    }
  }')

# Extract session ID from response headers
session_id=$(echo "$response" | grep -i "mcp-session-id" | cut -d' ' -f2 | tr -d '\r')
echo "Session ID: $session_id"
```

### Test: Session Reuse

```bash
# Use the same session ID for subsequent requests
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: $session_id" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### Test: Invalid Session ID

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: invalid-session-id-12345" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

**Expected**: 404 Not Found or error indicating invalid session

### Test: Stateless Mode

```bash
# Start server in stateless mode
MCP_STATELESS_MODE=true MCP_CURSOR_SECRET=$(openssl rand -base64 32) npm run dev

# Requests work without session management
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {"name": "stateless-test", "version": "1.0.0"}
    }
  }'
```

---

## Troubleshooting

### Common Issues

#### 1. "MCP_CURSOR_SECRET is required"

**Cause**: The server requires a cursor secret for HMAC-protected pagination.

**Solution**:
```bash
export MCP_CURSOR_SECRET=$(openssl rand -base64 32)
# Or add to .env file
```

#### 2. "mcp-protocol-version header required"

**Cause**: HTTP requests must include the protocol version header.

**Solution**: Add header to all requests:
```bash
-H "mcp-protocol-version: 2025-11-25"
```

#### 3. "listen EPERM: operation not permitted"

**Cause**: Sandbox or permission restrictions preventing port binding.

**Solution**:
- Run outside of restricted sandbox
- Try a different port: `MCP_PORT=8080`
- Check firewall settings

#### 4. Server exits after SIGTERM but doesn't terminate (HTTP-only mode)

**Cause**: Known bug (beads issue `3lf`). ShutdownManager doesn't call `process.exit()`.

**Workaround**: Use `SIGKILL` or wait for fix.

#### 5. "Invalid session ID" errors

**Cause**: Session expired (default TTL: 30 minutes) or wrong session ID.

**Solution**: Re-initialize to get a new session ID.

### Debug Mode

Enable verbose logging:
```bash
MCP_DEBUG=true MCP_LOG_LEVEL=debug npm run dev
```

### Health Check Endpoints

```bash
# Liveness check
curl http://localhost:3000/health

# Readiness check
curl http://localhost:3000/ready
```

---

## Running the Test Suite

### All Tests
```bash
npm test
```

### E2E Tests Only
```bash
npm run test:e2e
```

### Specific Test File
```bash
npx vitest run test/e2e/workflows/tool-execution.e2e.ts
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

---

## Appendix: Complete Test Script

Save as `full-manual-test.sh`:

```bash
#!/bin/bash
set -e

BASE_URL="http://localhost:3000/mcp"
PROTOCOL_VERSION="2025-11-25"

echo "=== MCP Reference Server Manual Test Suite ==="
echo ""

# Step 1: Initialize
echo "1. Initializing connection..."
INIT_RESPONSE=$(curl -s -i -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: $PROTOCOL_VERSION" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "'"$PROTOCOL_VERSION"'",
      "capabilities": {},
      "clientInfo": {"name": "manual-test", "version": "1.0.0"}
    }
  }')

SESSION_ID=$(echo "$INIT_RESPONSE" | grep -i "mcp-session-id" | cut -d' ' -f2 | tr -d '\r')
echo "Session ID: $SESSION_ID"
echo ""

# Step 2: Initialized notification
echo "2. Sending initialized notification..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: $PROTOCOL_VERSION" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc": "2.0", "method": "notifications/initialized"}'
echo "Done"
echo ""

# Step 3: List tools
echo "3. Listing tools..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: $PROTOCOL_VERSION" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}' | jq .
echo ""

# Step 4: Test calculator
echo "4. Testing calculator (15 + 27)..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: $PROTOCOL_VERSION" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {"name": "calculate", "arguments": {"operation": "add", "a": 15, "b": 27}}
  }' | jq .
echo ""

# Step 5: Test dice roller
echo "5. Testing dice roller (2d6+3)..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: $PROTOCOL_VERSION" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {"name": "roll_dice", "arguments": {"notation": "2d6+3"}}
  }' | jq .
echo ""

# Step 6: Test fortune teller
echo "6. Testing fortune teller..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: $PROTOCOL_VERSION" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {"name": "tell_fortune", "arguments": {"category": "career", "mood": "optimistic"}}
  }' | jq .
echo ""

# Step 7: Test error handling
echo "7. Testing error handling (unknown tool)..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: $PROTOCOL_VERSION" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {"name": "nonexistent", "arguments": {}}
  }' | jq .
echo ""

echo "=== Test Complete ==="
```

Make executable and run:
```bash
chmod +x full-manual-test.sh
./full-manual-test.sh
```
