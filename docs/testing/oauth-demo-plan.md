# OAuth 2.1 Authentication Demonstration Plan

## Objective

Create a comprehensive demonstration of the OAuth 2.1 + PKCE authentication flow implemented in the MCP Reference Server, using `agent-browser` for UI interactions and server logs to show backend processing.

## Demonstration Scope

### What We'll Demonstrate

1. **Complete OAuth 2.1 Authorization Code Flow with PKCE**
   - Authorization request with code_challenge
   - Login form handling
   - Authorization code generation
   - Token exchange with code_verifier
   - PKCE verification (S256)

2. **JWT Token Structure**
   - Access token claims (sub, aud, scope, exp, jti)
   - Refresh token structure
   - Token storage in sessionStorage

3. **Server-Side Processing**
   - Authorization code storage and single-use
   - PKCE challenge verification
   - JWT signing and issuance
   - Auth middleware validation

4. **Token Lifecycle**
   - Token expiration checking
   - Refresh token flow
   - Token rotation on refresh

5. **Protected API Access**
   - Bearer token in Authorization header
   - Middleware extraction and validation
   - Scope-based access control

## Implementation Approach

### Phase 1: Setup and Prerequisites

**Files involved:**
- `src/api/oauth-router.ts` - OAuth endpoints
- `src/api/jwt-issuer.ts` - Token generation
- `src/api/oauth-store.ts` - Code/token storage
- `packages/ui/src/lib/auth.ts` - Frontend auth

**Environment setup:**
```bash
# Backend with verbose logging
DEBUG=true AUTH_ENABLED=true OAUTH_SERVER_ENABLED=true \
OAUTH_TEST_USER=admin OAUTH_TEST_PASSWORD=secret123 \
MCP_CURSOR_SECRET=$(openssl rand -base64 32) \
OPENROUTER_API_KEY=<key> npm run dev

# Frontend
cd packages/ui && VITE_AUTH_REQUIRED=true npm run dev
```

### Phase 2: Demonstration Script

#### Step 1: Initial State (Unauthenticated)
- Open browser to localhost:5173
- Show login screen
- Capture snapshot showing "Sign In" button

#### Step 2: Authorization Request
- Click "Sign In" button
- Capture the redirect URL showing OAuth parameters:
  - `response_type=code`
  - `client_id=mcp-ui-client`
  - `code_challenge=<base64url>`
  - `code_challenge_method=S256`
  - `state=<random>`
- Show server log receiving authorization request

#### Step 3: Login Form
- Show OAuth login form
- Demonstrate the hidden PKCE state in browser
- Show sessionStorage contents (code_verifier, state)

#### Step 4: Credential Submission
- Fill username: admin
- Fill password: secret123
- Submit form
- Show server log:
  - Credential validation
  - Authorization code generation
  - Code storage with PKCE challenge

#### Step 5: Authorization Code Redirect
- Capture redirect URL with `code` and `state`
- Show code is opaque (base64url random)
- Show state matches original

#### Step 6: Token Exchange (PKCE Verification)
- Show browser making POST to /oauth/token
- Server logs showing:
  - Code lookup
  - PKCE verification: SHA256(verifier) == challenge
  - JWT access token generation
  - Refresh token generation
  - Code consumption (single-use)

#### Step 7: JWT Token Inspection
- Use browser eval to get access token
- Decode JWT (base64) to show claims:
  - `sub`: "admin"
  - `aud`: "mcp-ui-client"
  - `scope`: "openid profile"
  - `exp`: timestamp
  - `jti`: unique ID

#### Step 8: Authenticated State
- Show welcome screen with "Sign Out" button
- Verify sessionStorage contains:
  - auth_access_token
  - auth_refresh_token
  - auth_token_expires_at

#### Step 9: Protected API Access
- Send chat message
- Show Authorization header in network request
- Server log showing:
  - Auth middleware extracting token
  - JWT validation
  - req.auth populated with claims

#### Step 10: Sign Out
- Click Sign Out
- Show tokens cleared from sessionStorage
- Back to login screen

### Phase 3: Additional Demonstrations (Optional)

#### Token Refresh Flow
- Manually expire token
- Show refresh_token grant type
- Demonstrate token rotation

#### PKCE Security Demo
- Attempt token exchange without code_verifier
- Show 400 error response
- Demonstrate PKCE protection

#### Invalid Token Demo
- Modify token in sessionStorage
- Show API rejection (401)
- Demonstrate signature validation

## Output Artifacts

1. **Screenshots** (`test-screenshots/oauth-demo/`)
   - 01-initial-state.png
   - 02-auth-request-url.png
   - 03-login-form.png
   - 04-pkce-state.png
   - 05-credentials-filled.png
   - 06-code-redirect.png
   - 07-token-response.png
   - 08-jwt-decoded.png
   - 09-authenticated.png
   - 10-api-with-auth.png
   - 11-signed-out.png

2. **Server Logs** (captured via terminal)
   - Authorization request handling
   - Code generation with PKCE
   - Token exchange and verification
   - Auth middleware processing

3. **Documentation** (`docs/testing/oauth-demo-results.md`)
   - Step-by-step walkthrough with screenshots
   - Server log excerpts
   - JWT token examples
   - Security feature explanations

## Commands Reference

```bash
# Browser automation
agent-browser --session oauth open http://localhost:5173
agent-browser --session oauth snapshot
agent-browser --session oauth screenshot <path>
agent-browser --session oauth eval "sessionStorage.getItem('auth_code_verifier')"
agent-browser --session oauth eval "sessionStorage.getItem('auth_access_token')"
agent-browser --session oauth get url  # Show OAuth redirect URL

# JWT decoding
agent-browser --session oauth eval "JSON.parse(atob(sessionStorage.getItem('auth_access_token').split('.')[1]))"

# Network inspection
agent-browser --session oauth network requests --filter token
agent-browser --session oauth console
```

## Verification

After demonstration:
1. All screenshots captured showing each step
2. Server logs show PKCE verification working
3. JWT tokens decoded and claims verified
4. Token refresh demonstrated (optional)
5. Sign out clears all auth state
6. Results documented in oauth-demo-results.md

## Key Files

| File | Purpose |
|------|---------|
| `src/api/oauth-router.ts` | OAuth endpoints (/authorize, /login, /token) |
| `src/api/jwt-issuer.ts` | JWT creation with claims |
| `src/api/oauth-store.ts` | In-memory code/token storage |
| `src/auth/pkce.ts` | PKCE generation/verification |
| `packages/ui/src/lib/auth.ts` | Frontend auth flow |

## OAuth Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. AUTHORIZATION REQUEST                                        │
├─────────────────────────────────────────────────────────────────┤
│ Browser → GET /oauth/authorize?response_type=code&client_id=... │
│                                  &code_challenge=...             │
│                                  &state=...                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. LOGIN FORM                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Server → HTML Form (demo/demo credentials displayed)            │
│ User enters username + password                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. AUTHORIZATION CODE                                           │
├─────────────────────────────────────────────────────────────────┤
│ Server validates credentials                                    │
│ Server generates authorization code (256-bit random, 10min TTL) │
│ Server stores code with PKCE challenge                          │
│ Server redirects: /callback?code=...&state=...                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. TOKEN EXCHANGE                                               │
├─────────────────────────────────────────────────────────────────┤
│ Browser → POST /oauth/token                                     │
│   grant_type=authorization_code                                 │
│   code=...                                                      │
│   code_verifier=... (PKCE)                                      │
│   client_id=...                                                 │
│   redirect_uri=...                                              │
│                                                                 │
│ Server verifies: SHA256(code_verifier) == stored code_challenge │
│ Server issues JWT access_token + refresh_token                  │
│ Server marks code as consumed (single-use)                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. AUTHENTICATED API CALLS                                      │
├─────────────────────────────────────────────────────────────────┤
│ Browser → POST /api/chat                                        │
│   Authorization: Bearer <access_token>                          │
│                                                                 │
│ Auth middleware validates JWT, attaches req.auth                │
└─────────────────────────────────────────────────────────────────┘
```
