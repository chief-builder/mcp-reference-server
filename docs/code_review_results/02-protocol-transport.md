# Code Review: Protocol & Transport Domain

**Review Date:** 2026-01-18
**Files Reviewed:** 10
**Total Lines:** ~3,600

---

## Files Reviewed

| File | Lines | Description |
|------|-------|-------------|
| `src/protocol/jsonrpc.ts` | 606 | JSON-RPC 2.0 message handling |
| `src/protocol/errors.ts` | 457 | Error handling with MCP-specific codes |
| `src/protocol/capabilities.ts` | 388 | Capability negotiation |
| `src/protocol/lifecycle.ts` | 343 | Server state machine |
| `src/protocol/progress.ts` | 252 | Progress notifications with rate limiting |
| `src/protocol/pagination.ts` | 248 | Cursor-based pagination |
| `src/transport/http.ts` | 503 | HTTP transport with Express |
| `src/transport/sse.ts` | 490 | Server-Sent Events transport |
| `src/transport/stdio.ts` | 358 | Standard I/O transport |
| `src/transport/session.ts` | 193 | Session management |

---

## Executive Summary

This is a well-structured MCP server implementation following the 2025-11-25 specification. The codebase demonstrates solid TypeScript practices with Zod validation. However, there are critical DoS vulnerabilities in the transport layer and several issues with memory management in long-running connections.

---

## Issues by File

### 1. `src/protocol/jsonrpc.ts`

#### MEDIUM - Request Schema Allows Null ID (Lines 64-68, 296-311)

```typescript
// Schema says non-null
export const JsonRpcRequestSchema = JsonRpcBaseSchema.extend({
  id: z.union([z.string(), z.number().int()]), // Requests must have non-null id
  ...
});

// But parsing accepts null
const request: JsonRpcRequest = {
  jsonrpc: JSONRPC_VERSION,
  id: id as string | number,  // Casts null away
```

**Issue:** Type mismatch where schema says non-null but parsing accepts null.

**Recommendation:** Be consistent - either allow null in schema or reject in parsing.

#### LOW - Notification vs Request Schema Inconsistency

Notification schema uses `.strict()` but request schema does not.

#### LOW - Integer Overflow in ID Generator (Lines 184-189)

```typescript
let counter = 0;
return () => {
  counter += 1;
  return counter;
};
```

**Issue:** Could overflow `Number.MAX_SAFE_INTEGER` in extremely long sessions.

**Recommendation:** Reset or use BigInt for safety-critical systems.

---

### 2. `src/protocol/errors.ts`

#### MEDIUM - Server Error Range Variable Naming (Lines 442-444)

```typescript
export function isServerErrorCode(code: number): boolean {
  return code >= SERVER_ERROR_END && code <= SERVER_ERROR_START;
}
```

**Issue:** `SERVER_ERROR_END` (-32099) is less than `SERVER_ERROR_START` (-32000). The naming is confusing and could cause maintenance bugs.

**Recommendation:** Rename to `SERVER_ERROR_MIN` and `SERVER_ERROR_MAX`.

#### LOW - Error.captureStackTrace Edge Cases

Some non-V8 environments might still have issues. Consider wrapping in try-catch.

---

### 3. `src/protocol/capabilities.ts`

#### MEDIUM - Tight Coupling with LifecycleManager (Lines 64-71)

```typescript
export class CapabilityManager {
  private lifecycleManager: LifecycleManager;
```

**Issue:** Holds direct reference which could become stale if LifecycleManager is mutated.

**Recommendation:** Use a getter function or event-based updates.

#### LOW - Method Capability Mapping Creates New Object Each Call (Lines 312-338)

```typescript
export function getMethodCapabilityMapping(): Record<string, CapabilityPath> {
  return {
    'tools/list': 'tools',
    // ...
  };
}
```

**Recommendation:** Make it a constant for performance.

---

### 4. `src/protocol/lifecycle.ts`

#### MEDIUM - Protocol Version Exact Match Only (Lines 224-231)

```typescript
if (initParams.protocolVersion !== PROTOCOL_VERSION) {
  throw new LifecycleError(
    JsonRpcErrorCodes.INVALID_REQUEST,
    `Unsupported protocol version: ${initParams.protocolVersion}...`
  );
}
```

**Issue:** Only exact version match supported. MCP spec allows version negotiation.

**Recommendation:** Implement version negotiation for backwards compatibility.

#### MEDIUM - No Timeout for Initialization

**Issue:** No timeout mechanism for clients that send `initialize` but never `initialized`. Sessions could remain in limbo state.

**Recommendation:** Add configurable initialization timeout.

#### LOW - State Transition Not Atomic (Lines 233-238)

Multiple assignments without atomicity could cause inconsistent state with concurrent access.

---

### 5. `src/protocol/progress.ts`

#### MEDIUM - ProgressReporter Doesn't Handle Send Failures (Lines 221-226)

```typescript
private emit(progress: number, total?: number, message?: string): void {
  const notification = createProgressNotification(...);
  this.sendNotification(notification);  // No error handling
  this.lastEmitTime = Date.now();
```

**Issue:** If `sendNotification` throws, internal state becomes inconsistent.

**Recommendation:** Wrap in try-catch and handle errors.

#### LOW - Date.now() Not Monotonic

`Date.now()` can jump due to system clock changes. Consider `performance.now()`.

---

### 6. `src/protocol/pagination.ts`

#### HIGH - Weak Cursor Secret (Lines 84-85)

```typescript
const CURSOR_SECRET = process.env['MCP_CURSOR_SECRET'] ?? 'mcp-pagination-secret';
```

**Issue:** Default secret is hardcoded. If environment variable not set, attackers could forge cursors.

**Recommendation:** Fail-closed if no secret configured, or use cryptographically random default per instance.

#### MEDIUM - Cursor Has No Expiration

```typescript
interface CursorData {
  offset: number;
  timestamp: number;  // Included but never validated
  checksum: string;
}
```

**Issue:** Timestamp stored but never used. Old cursors remain valid forever.

**Recommendation:** Validate cursor age and reject expired cursors.

#### MEDIUM - No Session Binding for Cursors

**Issue:** Cursors not bound to sessions. A cursor from one user could be used by another.

**Recommendation:** Include session ID in cursor checksum.

---

### 7. `src/transport/http.ts`

#### CRITICAL - No Request Body Size Limit (Lines 240-241)

```typescript
private setupMiddleware(): void {
  this.app.use(express.json());
```

**Issue:** No body size limit configured. An attacker could send huge JSON payloads causing memory exhaustion (DoS).

**Recommendation:**
```typescript
this.app.use(express.json({ limit: '100kb' }));
```

#### MEDIUM - Missing CORS Header for Error Responses (Lines 318-320)

Error responses don't include CORS headers, causing confusing browser errors.

#### MEDIUM - Session Not Cleaned Up on SSE Disconnect

When client disconnects from SSE, session remains active and could accumulate.

#### MEDIUM - Stateless Mode Session Object Issues (Lines 426-431)

Race conditions possible if handlers modify the stateless session object.

#### MEDIUM - Error Response Leaks Internal Details (Lines 495-500)

```typescript
res.status(500).json({
  error: `Internal server error: ${errorMessage}`,
});
```

**Issue:** Full error messages exposed to clients.

**Recommendation:** Log details internally, return generic message to clients.

---

### 8. `src/transport/sse.ts`

#### HIGH - Event Buffer Memory Leak (Lines 266-273)

```typescript
private addToBuffer(event: SSEEvent): void {
  this.eventBuffer.push(event);
  while (this.eventBuffer.length > this.bufferSize) {
    this.eventBuffer.shift();  // O(n) operation
  }
}
```

**Issue:** Buffer persists for stream lifetime. `shift()` on large arrays is O(n).

**Recommendation:** Use circular buffer or deque data structure.

#### MEDIUM - Replay Doesn't Validate Session ID (Lines 362-378)

```typescript
handleReconnect(sessionId: string, lastEventId: string, res: Response): SSEStream {
  const lastSequence = this.parseEventIdSequence(lastEventId);
```

**Issue:** `lastEventId` contains `<session>:<sequence>` but only sequence extracted. Client could receive events from different session's buffer.

**Recommendation:** Validate session ID in event ID matches requested session.

#### LOW - No Maximum Buffer Size Validation

`bufferSize` option has no upper limit.

#### LOW - Write Errors Silently Caught

No logging when stream fails.

---

### 9. `src/transport/stdio.ts`

#### HIGH - Buffer Memory Accumulation (Lines 271-275)

```typescript
private handleData(chunk: Buffer | string): void {
  const data = typeof chunk === 'string' ? chunk : chunk.toString(ENCODING);
  this.buffer += data;
  this.processBuffer();
}
```

**Issue:** String concatenation with `+=` is inefficient. Malicious client sending long line without newlines causes memory exhaustion.

**Recommendation:** Add maximum line length check:
```typescript
if (this.buffer.length > MAX_LINE_LENGTH) {
  this.errorEmitter.emit('error', new Error('Line too long'));
  this.buffer = '';
}
```

#### MEDIUM - Signal Handlers Call process.exit() (Lines 337-343)

**Issue:** Direct `process.exit(0)` prevents other cleanup handlers from running.

**Recommendation:** Emit event and let application decide when to exit.

#### MEDIUM - No Backpressure Handling (Lines 152-154)

Return value of `write()` ignored. Slow stdout could cause unbounded memory buffering.

#### LOW - processBuffer After Close

Processing buffer after emitting 'close' could emit messages after close event.

---

### 10. `src/transport/session.ts`

#### HIGH - No Concurrent Access Protection

```typescript
private readonly sessions: Map<string, Session> = new Map();
```

**Issue:** No synchronization. Async operations between `getSession()` and modifications could race with cleanup timer.

**Recommendation:** Consider atomic operations or document single-threaded usage requirement.

#### MEDIUM - No Session Limit

**Issue:** No maximum number of sessions. Attacker could create many sessions causing memory exhaustion.

**Recommendation:** Add configurable session limit.

#### MEDIUM - Session State Not Synced with LifecycleManager

Session tracks own `state` field separate from LifecycleManager, could become inconsistent.

#### LOW - Cleanup Timer Race Condition

Race window between check and assignment for cleanup timer.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 4 |
| Medium | 14 |
| Low | 9 |

---

## Recommendations

### Immediate Actions (Critical/High)

1. **Add body size limit to Express**
   ```typescript
   app.use(express.json({ limit: '100kb' }));
   ```

2. **Remove or strengthen default cursor secret**

3. **Implement circular buffer for SSE events**

4. **Add maximum line length for stdio buffer**

### Short-term (Medium)

5. Add initialization timeout mechanism
6. Implement session limits
7. Sanitize error messages before sending to clients
8. Validate session ID in SSE reconnection
9. Add cursor expiration validation
10. Implement version negotiation

### Code Quality (Low)

11. Make schema strictness consistent
12. Use constants for method capability mappings
13. Add backpressure handling for stdio writes
14. Use `performance.now()` for monotonic time
