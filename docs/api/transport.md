---
layout: page
title: Transport API
---

# Transport API Reference

Exports for stdio and HTTP transports, session management, and SSE streaming.

## stdio Transport (`transport/stdio`)

### StdioTransport Class

```typescript
class StdioTransport {
  constructor(options?: StdioTransportOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: JsonRpcMessage): void;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onClose(handler: () => void): void;
  onError(handler: (error: Error) => void): void;
}

interface StdioTransportOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}
```

### Usage

```typescript
import { StdioTransport } from 'mcp-reference-server';

const transport = new StdioTransport();

transport.onMessage((message) => {
  console.log('Received:', message);
});

await transport.start();
```

## HTTP Transport (`transport/http`)

### HttpTransport Class

```typescript
class HttpTransport {
  constructor(options: HttpTransportOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  getPort(): number;
  getApp(): Express;
}

interface HttpTransportOptions {
  port?: number;
  host?: string;
  sseEnabled?: boolean;
  sessionTimeout?: number;
  authValidator?: OAuthValidator;
  corsOrigins?: string[];
}
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | JSON-RPC requests |
| `/mcp/sse` | GET | SSE event stream |
| `/health` | GET | Health check |
| `/health/ready` | GET | Readiness probe |
| `/health/live` | GET | Liveness probe |

### Usage

```typescript
import { HttpTransport } from 'mcp-reference-server';

const transport = new HttpTransport({
  port: 3000,
  host: '0.0.0.0',
  sseEnabled: true,
});

await transport.start();
console.log(`Server running on port ${transport.getPort()}`);
```

## Session Management (`transport/session`)

### SessionManager Class

```typescript
class SessionManager {
  constructor(options?: SessionManagerOptions);
  createSession(transportType: string): Session;
  getSession(sessionId: string): Session | undefined;
  destroySession(sessionId: string): boolean;
  getActiveSessions(): Session[];
  getSessionCount(): number;
  cleanup(): void;
}

interface SessionManagerOptions {
  timeout?: number;      // Session timeout in ms
  maxSessions?: number;  // Maximum concurrent sessions
}

interface Session {
  id: string;
  transportType: string;
  createdAt: Date;
  lastActivity: Date;
  state: SessionState;
}

type SessionState = 'active' | 'idle' | 'closed';
```

### Usage

```typescript
import { SessionManager } from 'mcp-reference-server';

const sessions = new SessionManager({
  timeout: 3600000,  // 1 hour
  maxSessions: 100,
});

const session = sessions.createSession('http');
console.log(`Created session: ${session.id}`);

// Cleanup expired sessions
sessions.cleanup();
```

## SSE Transport (`transport/sse`)

### SSEManager Class

```typescript
class SSEManager {
  constructor();
  addClient(sessionId: string, response: Response): void;
  removeClient(sessionId: string): void;
  hasClient(sessionId: string): boolean;
  send(sessionId: string, event: SSEEvent): void;
  broadcast(event: SSEEvent): void;
  getClientCount(): number;
  replay(sessionId: string, lastEventId: string): void;
}

interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}
```

### Event Buffering

SSE events are buffered for replay on reconnection:

```typescript
import { SSEManager } from 'mcp-reference-server';

const sse = new SSEManager();

// Send event with ID for replay
sse.send(sessionId, {
  id: '42',
  event: 'message',
  data: JSON.stringify({ method: 'notifications/progress' })
});

// Client reconnects with Last-Event-ID
sse.replay(sessionId, '40');  // Replays events 41, 42, ...
```

### Headers

SSE responses include:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

## Related

- [Transports Guide](../guides/transports) - Transport concepts
- [Authentication Guide](../guides/authentication) - OAuth for HTTP
