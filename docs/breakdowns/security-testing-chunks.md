# MCP Security Testing - Implementation Chunks

**Spec**: `docs/testing/agent-browser-mcp-security-test-guide.md`
**Created**: 2026-01-22
**Approach**: Risk-first (Known gaps → Working controls → Browser integration)
**Beads**: Integrated (use /auto to implement)

## Progress

- [ ] Phase 1: Known Security Gaps (2 chunks) - HIGH PRIORITY
- [ ] Phase 2: Working Security Controls (4 chunks)
- [ ] Phase 3: Browser Integration Tests (1 chunk)

---

## Phase 1: Known Security Gaps

### [ ] CHUNK-01: Rate Limiting & Unauthenticated Endpoints Tests
**Goal**: Execute and document tests for known security gaps (G1, G2)
**Done When**:
- [ ] Test G1 executed: 100 rapid requests to `/api/health` all return 200 (documenting gap)
- [ ] Test G2 executed: `/api/cancel` returns 200 without auth (documenting gap)
- [ ] Screenshots saved to `security-test-screenshots/g1-rate-limiting.png` and `g2-unauth-cancel.png`
- [ ] Results documented with actual vs expected behavior
- [ ] Discovered issues filed to beads

**Scope**: curl tests, `security-test-screenshots/`
**Size**: S
**Risk**: None (documenting known gaps)
**Beads**: #cqz

### [ ] CHUNK-02: JWT Signature & Token Tests
**Goal**: Execute token manipulation tests (B1, B2) to verify/document JWT handling
**Done When**:
- [ ] Test B1 executed: Forged JWT token tested, behavior documented (GAP if accepted)
- [ ] Test B2 executed: Expired JWT returns 401 Token expired
- [ ] Results include HTTP status codes and response bodies
- [ ] Screenshot or log of token test results saved
- [ ] Discovered issues filed to beads

**Scope**: curl tests for `/api/chat` with manipulated tokens
**Size**: S
**Risk**: HIGH - Documents critical JWT signature gap
**Beads**: #lm1

---

## Phase 2: Working Security Controls

### [ ] CHUNK-03: Authentication Bypass Tests
**Goal**: Verify auth middleware blocks unauthenticated requests (A1, A2)
**Done When**:
- [ ] Test A1 executed: POST `/api/chat` without Authorization returns 401
- [ ] Test A2 executed: Malformed Authorization headers (Basic, empty Bearer) return 401
- [ ] All 401 responses include proper error messages
- [ ] Results documented with HTTP status codes
- [ ] Discovered issues filed to beads

**Scope**: curl tests for `/api/chat`
**Size**: S
**Risk**: None
**Beads**: #yam
**Depends on**: None

### [ ] CHUNK-04: OAuth/PKCE Security Tests
**Goal**: Verify PKCE enforcement and state CSRF protection (C1, C2, C3)
**Done When**:
- [ ] Test C1 executed: `/oauth/token` without code_verifier returns 400 "Missing code_verifier"
- [ ] Test C2 executed: Callback with wrong state redirects to login or shows error
- [ ] Test C3 executed: Replayed auth code returns 400 "invalid_grant"
- [ ] Screenshots saved for state mismatch test
- [ ] Discovered issues filed to beads

**Scope**: curl + agent-browser tests for OAuth endpoints
**Size**: M
**Risk**: None
**Beads**: #iz6
**Depends on**: CHUNK-03

### [ ] CHUNK-05: Session & Input Validation Tests
**Goal**: Verify session security and input validation (D1, E1, E2)
**Done When**:
- [ ] Test D1 executed: Forged session ID returns 404 "Session not found"
- [ ] Test E1 executed: Invalid JSON returns -32700 Parse error
- [ ] Test E1 executed: Missing fields returns -32600 Invalid Request
- [ ] Test E2 executed: >100KB payload returns 413 Payload Too Large
- [ ] Discovered issues filed to beads

**Scope**: curl tests for `/mcp` endpoint
**Size**: M
**Risk**: None
**Beads**: #kfc
**Depends on**: None (can run parallel with CHUNK-04)

### [ ] CHUNK-06: CORS & Error Disclosure Tests
**Goal**: Verify CORS origin validation and error sanitization (F1, H1)
**Done When**:
- [ ] Test F1 executed: Evil origin gets no CORS headers
- [ ] Test F1 executed: Allowed origin gets `Access-Control-Allow-Origin` header
- [ ] Test H1 executed: Error response contains no stack traces or file paths
- [ ] Error messages are generic (e.g., "Method not found" not internal details)
- [ ] Discovered issues filed to beads

**Scope**: curl OPTIONS and error tests
**Size**: S
**Risk**: None
**Beads**: #in0
**Depends on**: None (can run parallel with CHUNK-04, CHUNK-05)

---

## Phase 3: Browser Integration Tests

### [ ] CHUNK-07: Full Browser Security Workflow
**Goal**: Execute complete browser security test workflow (Steps 1-7)
**Done When**:
- [ ] Step 1: Unauthenticated access shows login button, not chat
- [ ] Step 2: Wrong credentials show error, no login
- [ ] Step 3: Valid login shows chat interface
- [ ] Step 4: Token storage inspection completed
- [ ] Step 5: Logout clears token, returns to login
- [ ] Step 6: Post-logout cannot access chat
- [ ] All screenshots saved to `security-test-screenshots/`
- [ ] Discovered issues filed to beads

**Scope**: agent-browser workflow, `security-test-screenshots/`
**Size**: L
**Risk**: Browser automation timing issues
**Beads**: #0sc
**Depends on**: CHUNK-03, CHUNK-04 (auth must work)

---

## Discovered During Implementation

- [ ] (To be filled during implementation)

## Notes

- **Risk-first approach**: Phase 1 documents known gaps for prioritization
- **Parallel opportunities**: CHUNK-05 and CHUNK-06 can run parallel with CHUNK-04
- **Browser tests last**: Depend on auth working correctly
- **Large session size**: Each phase can be completed in one session
