# OAuth Demo - Implementation Chunks

**Spec**: `docs/testing/oauth-demo-plan.md`
**Created**: 2026-01-22
**Approach**: Sequential (demo steps depend on each other)
**Beads**: Integrated (use /auto to implement)

## Progress

- [ ] Phase 1: Setup (1 chunk)
- [ ] Phase 2: Core Demo (2 chunks)
- [ ] Phase 3: Security Demos (1 chunk)
- [ ] Phase 4: Documentation (1 chunk)

## Phase 1: Setup

### [ ] CHUNK-01: Setup & Prerequisites Verification
**Goal**: Verify servers are running and create screenshot directories
**Done When**:
- [ ] Backend server responds at http://localhost:3000/health
- [ ] Frontend server responds at http://localhost:5173
- [ ] Directory `test-screenshots/oauth-demo/` exists
- [ ] agent-browser session opens successfully to localhost:5173
- [ ] Login screen with "Sign In" button is visible
- [ ] Discovered issues filed to beads

**Scope**: test-screenshots/oauth-demo/, browser session setup
**Size**: S
**Risk**: None
**Beads**: #069

## Phase 2: Core Demo

### [ ] CHUNK-02: OAuth Authorization Flow Demo (Steps 1-6)
**Goal**: Demonstrate OAuth 2.1 + PKCE from login through token exchange
**Done When**:
- [ ] Screenshot `01-initial-state.png` shows login screen
- [ ] Screenshot `02-auth-request-url.png` shows URL with OAuth params (response_type, code_challenge, state)
- [ ] Screenshot `03-login-form.png` shows OAuth form
- [ ] Screenshot `04-pkce-state.png` shows sessionStorage with code_verifier
- [ ] Screenshot `05-credentials-filled.png` shows form with admin/secret123
- [ ] Screenshot `06-code-redirect.png` shows callback URL with code and state
- [ ] Server logs captured showing authorization code generation
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: agent-browser automation, test-screenshots/oauth-demo/
**Size**: M
**Risk**: OAuth first-attempt may fail (known timing issue - retry)
**Beads**: #829
**Depends On**: CHUNK-01

### [ ] CHUNK-03: Token & Protected API Demo (Steps 7-10)
**Goal**: Demonstrate JWT token structure and authenticated API access
**Done When**:
- [ ] Screenshot `07-token-response.png` shows authenticated state
- [ ] Screenshot `08-jwt-decoded.png` shows decoded JWT claims (sub, aud, scope, exp, jti)
- [ ] sessionStorage contains auth_access_token, auth_refresh_token, auth_token_expires_at
- [ ] Screenshot `09-api-with-auth.png` shows successful chat with tool response
- [ ] Server logs show auth middleware extracting and validating JWT
- [ ] Screenshot `10-signed-out.png` shows logged out state
- [ ] sessionStorage cleared after sign out
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: agent-browser automation, test-screenshots/oauth-demo/
**Size**: M
**Risk**: None
**Beads**: #3z9
**Depends On**: CHUNK-02

## Phase 3: Security Demos (Optional)

### [ ] CHUNK-04: PKCE & Token Security Demos
**Goal**: Demonstrate security protections against token attacks
**Done When**:
- [ ] PKCE test: Token exchange without code_verifier returns 400 error
- [ ] Invalid token test: Modified token in sessionStorage causes 401 on API call
- [ ] Security demo screenshots captured (optional naming)
- [ ] Server logs show rejection with appropriate error codes
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: agent-browser automation, server logs
**Size**: S
**Risk**: May require manual curl commands if agent-browser can't manipulate token exchange
**Beads**: #9md
**Depends On**: CHUNK-02

## Phase 4: Documentation

### [ ] CHUNK-05: Compile Demo Results Document
**Goal**: Create comprehensive documentation with all screenshots and findings
**Done When**:
- [ ] File `docs/testing/oauth-demo-results.md` exists
- [ ] Document includes step-by-step walkthrough with all screenshots
- [ ] Document includes server log excerpts showing PKCE verification
- [ ] Document includes decoded JWT example with claim explanations
- [ ] Document includes security demo results (if performed)
- [ ] All screenshots referenced are present in test-screenshots/oauth-demo/
- [ ] Validation passes
- [ ] Discovered issues filed to beads

**Scope**: docs/testing/oauth-demo-results.md
**Size**: M
**Risk**: None
**Beads**: #xmb
**Depends On**: CHUNK-03

## Discovered During Implementation

(To be populated during execution)

## Notes

- OAuth login occasionally fails on first attempt - this is a known PKCE timing issue, retry succeeds
- Server logs are viewed in the terminal running the backend, not through agent-browser
- JWT decoding done via: `agent-browser --session oauth eval "JSON.parse(atob(sessionStorage.getItem('auth_access_token').split('.')[1]))"`
- Security demos (CHUNK-04) are optional but valuable for demonstrating PKCE protection
