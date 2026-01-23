# CHUNK-06: CORS & Error Disclosure Tests

**Executed:** 2026-01-23 07:19 EST
**Server:** localhost:3000

---

## Test F1: CORS - Evil Origin

**Purpose:** Verify evil origins do not receive CORS headers.

### Test Execution
```bash
curl -v -X OPTIONS http://localhost:3000/mcp \
  -H "Origin: https://evil-site.com" \
  -H "Access-Control-Request-Method: POST"
```

### Results
| Header | Value |
|--------|-------|
| HTTP Status | 204 No Content |
| Access-Control-Allow-Origin | https://evil-site.com |
| Access-Control-Allow-Methods | GET, POST, OPTIONS |
| Access-Control-Allow-Credentials | true |

### Analysis
**SECURITY GAP CONFIRMED:** The server returns CORS headers for ANY origin, including malicious ones like `https://evil-site.com`.

**Root Cause:** In `/src/cli.ts` line 101, the server is configured with `allowedOrigins: ['*']` which allows all origins.

**Security Impact:**
- Cross-Site Request Forgery (CSRF) attacks possible
- Malicious websites can make authenticated requests to the MCP server
- Session hijacking via cross-origin requests
- Data exfiltration from legitimate sessions

---

## Test F1: CORS - Allowed Origin

**Purpose:** Verify allowed origins receive proper CORS headers.

### Test Execution
```bash
curl -v -X OPTIONS http://localhost:3000/mcp \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"
```

### Results
| Header | Value |
|--------|-------|
| HTTP Status | 204 No Content |
| Access-Control-Allow-Origin | http://localhost:5173 |
| Access-Control-Allow-Methods | GET, POST, OPTIONS |
| Access-Control-Allow-Headers | Content-Type, Accept, mcp-protocol-version, mcp-session-id, Authorization, Last-Event-Id |
| Access-Control-Expose-Headers | mcp-session-id |
| Access-Control-Allow-Credentials | true |

### Analysis
Allowed origin works correctly. The issue is that ALL origins are currently allowed due to wildcard configuration.

---

## Test H1: Error Disclosure

**Purpose:** Verify error responses do not leak internal details (stack traces, file paths, function names).

### Test Execution

#### Test H1.1: Invalid Method
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: <valid-session>" \
  -d '{"jsonrpc":"2.0","method":"internal/debug","id":2}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": {
      "method": "internal/debug"
    }
  }
}
```

**Analysis:** PASS - Generic error message, no internal details exposed.

---

#### Test H1.2: Nonexistent Method
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: <valid-session>" \
  -d '{"jsonrpc":"2.0","method":"nonexistent/method","id":3}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": {
      "method": "nonexistent/method"
    }
  }
}
```

**Analysis:** PASS - Generic error message, method name echoed but no stack traces or file paths.

---

#### Test H1.3: Malformed JSON
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","method":'
```

**Response:**
```json
{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error"},"id":null}
```

**Analysis:** PASS - Generic parse error, no internal details.

---

#### Test H1.4: Invalid ID Type
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":{"invalid":"object"}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32600,
    "message": "Invalid Request: id must be string, integer, or null"
  }
}
```

**Analysis:** PASS - Generic validation error.

---

#### Test H1.5: Path Traversal in Tool Name
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: <valid-session>" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":4,"params":{"name":"../../etc/passwd","arguments":{}}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Tool '../../etc/passwd' failed: Unknown tool: ../../etc/passwd\n\nDetails: {\n  \"availableTools\": [\n    \"calculate\",\n    \"roll_dice\",\n    \"tell_fortune\",\n    \"slow_operation\"\n  ]\n}"
      }
    ],
    "isError": true
  }
}
```

**Analysis:** PARTIAL PASS - No stack traces or file paths leaked. However, the response reveals available tool names which could be useful for reconnaissance.

---

#### Test H1.6: Invalid Tool Arguments
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -H "mcp-session-id: <valid-session>" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":6,"params":{"name":"calculate","arguments":{"expression":"invalid("}}}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Tool 'calculate' failed: Invalid arguments for tool 'calculate'\n\nDetails: {\n  \"validationErrors\": [\n    \"//operation: required property is missing\",\n    \"//a: required property is missing\",\n    \"//b: required property is missing\",\n    \"//expression: additional property not allowed\"\n  ]\n}"
      }
    ],
    "isError": true
  }
}
```

**Analysis:** PASS - Validation errors shown without internal details.

---

#### Test H1.7: Invalid Params Type
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":7,"params":"not-an-object"}'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32602,
    "message": "Invalid params: must be an object"
  }
}
```

**Analysis:** PASS - Generic validation error.

---

## Summary

| Test | Category | Expected | Actual Result | Status |
|------|----------|----------|---------------|--------|
| F1 (Evil Origin) | CORS | No CORS headers | CORS headers returned | **FAILED** |
| F1 (Allowed Origin) | CORS | CORS headers | CORS headers returned | PASSED |
| H1.1 (Invalid Method) | Error Disclosure | Generic error | Generic error | PASSED |
| H1.2 (Nonexistent Method) | Error Disclosure | Generic error | Generic error | PASSED |
| H1.3 (Malformed JSON) | Error Disclosure | No stack traces | No stack traces | PASSED |
| H1.4 (Invalid ID Type) | Error Disclosure | No stack traces | No stack traces | PASSED |
| H1.5 (Path Traversal) | Error Disclosure | No file paths | No file paths | PASSED |
| H1.6 (Invalid Arguments) | Error Disclosure | No internal details | Validation errors only | PASSED |
| H1.7 (Invalid Params Type) | Error Disclosure | Generic error | Generic error | PASSED |

---

## Discovered Issues (Filed to Beads)

### Issue 1: Overly Permissive CORS Configuration (NEW)
- **Beads ID:** MCP_11252025_Reference-cor
- **Location:** `/src/cli.ts` line 101
- **Impact:** High (P1) - CSRF and cross-origin attack vulnerability
- **Current Behavior:** `allowedOrigins: ['*']` allows any website to make authenticated requests
- **Recommendation:** Replace wildcard with explicit allowed origins list

### Issue 2: Tool Name Enumeration in Error Response (Minor)
- **Note:** Error responses for unknown tools reveal the list of available tools. This is low severity but could aid reconnaissance. Not filing as separate issue - consider as part of overall error handling review.

---

## Security Recommendations

1. **CORS Configuration (Critical):**
   - Remove wildcard `'*'` from `allowedOrigins`
   - Configure explicit allowed origins (e.g., `['http://localhost:5173', 'https://your-production-domain.com']`)
   - Consider making this configurable via environment variable

2. **Error Response Hardening (Optional):**
   - Consider not exposing available tool names in error responses
   - Use generic "Tool not found" without enumeration

---

## Report Summary

**STATUS:** success
**FILES_CREATED:** security-test-screenshots/CHUNK-06-results.md
**TESTS:** F1 (CORS evil/allowed origin), H1 (error disclosure - 7 scenarios)
**DISCOVERED:** CORS wildcard vulnerability (P1)
**NOTES:** Error handling is well-implemented with no stack traces or file paths leaked. Main security gap is the overly permissive CORS configuration.
