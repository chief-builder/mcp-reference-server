# MCP Security Testing Guide with Agent-Browser CLI

This guide documents security testing procedures for the MCP Reference Server using the `agent-browser` CLI tool.

## Prerequisites

1. **Backend Server with Security Enabled**
   ```bash
   OPENROUTER_API_KEY=<your-key> \
   AUTH_ENABLED=true \
   OAUTH_SERVER_ENABLED=true \
   OAUTH_TEST_USER=admin \
   OAUTH_TEST_PASSWORD=secret123 \
   MCP_CURSOR_SECRET=$(openssl rand -base64 32) \
   npm run dev
   ```

2. **Frontend Server with Auth Required**
   ```bash
   cd packages/ui
   VITE_AUTH_REQUIRED=true npm run dev
   ```

3. **agent-browser CLI** installed globally
   ```bash
   npm install -g agent-browser
   agent-browser install
   ```

4. **curl** for API-level security tests

5. **Security Screenshots Directory**
   ```bash
   mkdir -p security-test-screenshots
   ```

## Quick Start

```bash
# Start a fresh security test session
agent-browser --session sectest open http://localhost:5173

# Run security checks
agent-browser --session sectest snapshot
agent-browser --session sectest screenshot security-test-screenshots/initial.png

# Close when done
agent-browser --session sectest close
```

---

## Category A: Authentication Bypass Tests

### Test A1: Access Without Authorization

**Purpose:** Verify protected endpoints reject unauthenticated requests.

**Browser Test:**
```bash
agent-browser --session sectest open http://localhost:5173
agent-browser --session sectest snapshot
```

**Expected (PASS):**
```
- document:
  - heading "MCP Agent Chat"
  - paragraph: Sign in to start chatting with the agent
  - button "Sign In" [ref=e2]
```

**API Test:**
```bash
curl -v -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'
```

**Expected Response:**
```
HTTP/1.1 401 Unauthorized
```

### Test A2: Malformed Authorization Header

**Purpose:** Verify token format validation.

```bash
# Non-Bearer scheme
curl -v -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic dXNlcjpwYXNz" \
  -d '{"message": "test"}'

# Empty Bearer token
curl -v -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer " \
  -d '{"message": "test"}'
```

**Expected:** 401 Unauthorized for all malformed headers.

---

## Category B: Token Manipulation Tests

### Test B1: Forged JWT Token

**Purpose:** Test rejection of tokens with invalid signatures.

> **Known Gap:** MVP auth middleware does NOT verify JWT signatures (`src/api/auth-middleware.ts:53`). This test documents current vs expected behavior.

```bash
# Forged token with fake signature
FORGED_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciIsImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNzA2MDAwMDAwfQ.FAKE_SIGNATURE"

curl -v -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FORGED_JWT" \
  -d '{"message": "test"}'
```

**Current Behavior (GAP):** Request may succeed (no signature verification).
**Expected (Production):** 401 Invalid token signature.

### Test B2: Expired Token

**Purpose:** Verify expired tokens are rejected (60s clock skew tolerance).

```bash
# Token with exp in the past
EXPIRED_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxMDAwMDAwMDAwLCJpYXQiOjEwMDAwMDAwMDB9.test"

curl -v -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EXPIRED_JWT" \
  -d '{"message": "test"}'
```

**Expected (PASS):** 401 Token expired.

---

## Category C: OAuth/PKCE Security Tests

### Test C1: PKCE Bypass Attempt

**Purpose:** Verify PKCE is mandatory (plain method rejected, S256 required).

```bash
# Missing code_verifier
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=any-code" \
  -d "client_id=mcp-ui-client" \
  -d "redirect_uri=http://localhost:5173/callback"
```

**Expected (PASS):**
```json
{
  "error": "invalid_request",
  "error_description": "Missing code_verifier parameter"
}
```

### Test C2: State Parameter CSRF Protection

**Purpose:** Verify state parameter prevents CSRF attacks.

```bash
# Start OAuth flow
agent-browser --session sectest open http://localhost:5173
agent-browser --session sectest click @e2
sleep 2

# Capture URL with state parameter
agent-browser --session sectest eval "window.location.href"
```

**Expected:** URL contains `state=<random-value>`.

```bash
# Test with wrong state
agent-browser --session sectest open "http://localhost:5173/callback?code=test&state=WRONG_STATE"
agent-browser --session sectest snapshot
agent-browser --session sectest screenshot security-test-screenshots/c2-state-mismatch.png
```

**Expected (PASS):** Error about state validation failure or redirect to login.

### Test C3: Authorization Code Replay

**Purpose:** Verify auth codes are single-use.

```bash
# After completing OAuth login, attempt to reuse the code
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=<already-used-code>" \
  -d "client_id=mcp-ui-client" \
  -d "redirect_uri=http://localhost:5173/callback" \
  -d "code_verifier=<original-verifier>"
```

**Expected (PASS):**
```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code is invalid or expired"
}
```

---

## Category D: Session Security Tests

### Test D1: Session Hijacking

**Purpose:** Test that forged session IDs are rejected.

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-03-26" \
  -H "mcp-session-id: forged-session-id-12345" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**Expected (PASS):** 404 Session not found.

### Test D2: Session Expiration

**Purpose:** Verify sessions expire after 30 minutes of inactivity.

```bash
# After 30+ minutes of inactivity
agent-browser --session sectest eval "location.reload()"
agent-browser --session sectest snapshot
```

**Expected (PASS):** User redirected to login after session expiry.

---

## Category E: Input Validation Tests

### Test E1: JSON-RPC Injection

**Purpose:** Test handling of malicious payloads.

```bash
# Invalid JSON
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-03-26" \
  -d 'not valid json{'
```

**Expected (PASS):**
```json
{
  "jsonrpc": "2.0",
  "error": { "code": -32700, "message": "Parse error" },
  "id": null
}
```

```bash
# Missing required fields
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-03-26" \
  -d '{"jsonrpc":"2.0"}'
```

**Expected (PASS):**
```json
{
  "jsonrpc": "2.0",
  "error": { "code": -32600, "message": "Invalid Request" },
  "id": null
}
```

### Test E2: Payload Size Limit (100KB)

**Purpose:** Verify DoS protection via payload limits.

```bash
# Generate >100KB payload
LARGE_PAYLOAD=$(python3 -c "print('{\"jsonrpc\":\"2.0\",\"method\":\"test\",\"params\":{\"data\":\"' + 'A' * 150000 + '\"},\"id\":1}')")

curl -v -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-03-26" \
  -d "$LARGE_PAYLOAD"
```

**Expected (PASS):** 413 Payload Too Large.

---

## Category F: CORS Security Tests

### Test F1: Origin Validation

**Purpose:** Verify CORS blocks unauthorized origins.

```bash
# Unauthorized origin
curl -v -X OPTIONS http://localhost:3000/mcp \
  -H "Origin: https://evil-site.com" \
  -H "Access-Control-Request-Method: POST"
```

**Expected (PASS):** No `Access-Control-Allow-Origin` header returned.

```bash
# Allowed origin
curl -v -X OPTIONS http://localhost:3000/mcp \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"
```

**Expected (PASS):**
```
Access-Control-Allow-Origin: http://localhost:5173
```

---

## Category G: Known Security Gaps

### Test G1: Rate Limiting (NOT IMPLEMENTED)

**Purpose:** Document lack of rate limiting.

```bash
# Send 100 rapid requests
for i in {1..100}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health &
done
wait
```

**Current Behavior (GAP):** All requests succeed.
**Expected (Production):** 429 Too Many Requests after threshold.

**Impact:** Potential DoS, brute force attacks.

### Test G2: Unauthenticated Cancel Endpoint

**Purpose:** Document unauthenticated cancel endpoint.

```bash
curl -X POST http://localhost:3000/api/cancel \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "any-session-id"}'
```

**Current Behavior (GAP):** Returns 200 (no auth required).
**Expected (Production):** 401 Unauthorized.

**Impact:** Attacker could attempt to cancel other users' sessions.

---

## Category H: Error Information Disclosure

### Test H1: Error Message Leakage

**Purpose:** Verify errors don't leak implementation details.

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-protocol-version: 2025-03-26" \
  -H "mcp-session-id: valid-session" \
  -d '{"jsonrpc":"2.0","method":"internal/debug","id":1}'
```

**Verify Response:**
- Does NOT contain stack traces
- Does NOT contain file paths
- Does NOT contain internal function names

**Expected (PASS):**
```json
{
  "jsonrpc": "2.0",
  "error": { "code": -32601, "message": "Method not found" },
  "id": 1
}
```

---

## Browser Security Test Workflow

### Step 1: Unauthenticated Access Test
```bash
agent-browser --session sectest open http://localhost:5173
agent-browser --session sectest snapshot
agent-browser --session sectest screenshot security-test-screenshots/01-unauth.png
```
**Verify:** Login button visible, no chat interface.

### Step 2: Wrong Credentials Test
```bash
agent-browser --session sectest click @e2
sleep 2
agent-browser --session sectest fill @e2 "wrong-user"
agent-browser --session sectest fill @e3 "wrong-pass"
agent-browser --session sectest click @e4
sleep 2
agent-browser --session sectest snapshot
agent-browser --session sectest screenshot security-test-screenshots/02-wrong-creds.png
```
**Verify:** Error message, no login.

### Step 3: Valid Login
```bash
agent-browser --session sectest fill @e2 "admin"
agent-browser --session sectest fill @e3 "secret123"
agent-browser --session sectest click @e4
sleep 3
agent-browser --session sectest snapshot
```
**Verify:** Chat interface visible.

### Step 4: Token Storage Inspection
```bash
agent-browser --session sectest eval "Object.keys(localStorage).filter(k => k.includes('token'))"
```
**Security Note:** Tokens in localStorage are vulnerable to XSS. Production should use httpOnly cookies.

### Step 5: Logout and Token Cleanup
```bash
agent-browser --session sectest click @e2
sleep 2
agent-browser --session sectest eval "localStorage.getItem('mcp_access_token')"
agent-browser --session sectest snapshot
```
**Verify:** Token cleared, back to login screen.

### Step 6: Post-Logout Access Test
```bash
agent-browser --session sectest open http://localhost:5173
agent-browser --session sectest snapshot
```
**Verify:** Cannot access chat without re-authenticating.

### Step 7: Close Session
```bash
agent-browser --session sectest close
```

---

## Security Test Commands Reference

| Test | Command | Expected Result |
|------|---------|-----------------|
| No Auth Header | `curl POST /api/chat` | 401 Unauthorized |
| Empty Bearer | `Authorization: Bearer ` | 401 Invalid format |
| Forged JWT | Fake signature | 401 (should be) |
| Expired Token | Past `exp` claim | 401 Token expired |
| Missing PKCE | `/oauth/token` no verifier | 400 Missing code_verifier |
| Wrong State | Callback wrong state | Redirect to login |
| Code Replay | Reuse auth code | 400 Invalid grant |
| Forged Session | Random session ID | 404 Session not found |
| Large Payload | >100KB JSON | 413 Too Large |
| Invalid JSON | Malformed body | -32700 Parse error |
| Wrong Origin | CORS evil origin | No CORS headers |
| Rate Limit | 100 rapid requests | All succeed (GAP) |
| Unauth Cancel | `/api/cancel` no auth | 200 (GAP) |

---

## Security Findings Summary

### Working Security Controls
- OAuth 2.1 + PKCE (S256 only, no plain)
- Timing-safe state validation (CSRF protection)
- Single-use authorization codes
- 100KB HTTP payload limit
- CORS origin validation
- Session TTL (30 minutes)
- Error sanitization (no stack traces)
- UUID v4 session IDs (cryptographically random)

### Known Security Gaps
| Gap | Location | Impact | Recommendation |
|-----|----------|--------|----------------|
| No JWT signature verification | `src/api/auth-middleware.ts:53` | Token forgery | Implement JWKS verification |
| No rate limiting | All endpoints | DoS, brute force | Add rate limiting middleware |
| Unauthenticated cancel | `src/api/cancel-handler.ts` | Session disruption | Require authentication |
| ReDoS potential | `src/tools/executor.ts` regex | DoS | Limit pattern complexity |

---

## Troubleshooting

### Tests returning unexpected 200 OK
- Verify `AUTH_ENABLED=true` is set
- Check server logs for middleware bypass
- Ensure testing correct endpoint

### OAuth flow not working
- Verify `OAUTH_SERVER_ENABLED=true`
- Check `OAUTH_TEST_USER` and `OAUTH_TEST_PASSWORD`
- OAuth code expires in 10 minutes

### Session tests failing
- MCP sessions are separate from OAuth sessions
- Initialize MCP session first with `initialize` method
- Sessions expire after 30 minutes

### Browser automation issues
```bash
# Reinstall browser binaries
agent-browser install

# Check console for errors
agent-browser --session sectest console
```

### Rate limiting tests
- No rate limiting implemented (documented gap)
- Tests exist to document expected vs current behavior
