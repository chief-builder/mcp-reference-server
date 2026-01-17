---
layout: page
title: Observability API
---

# Observability API Reference

Exports for health checks, metrics collection, and distributed tracing.

## Health Checks (`observability/health`)

### HealthChecker Class

Manages health checks for the MCP server with liveness and readiness endpoints.

```typescript
class HealthChecker {
  constructor(options?: { version?: string });

  /** Register a health check */
  registerCheck(name: string, check: HealthCheckFn): void;

  /** Unregister a health check */
  unregisterCheck(name: string): void;

  /** Run all registered checks */
  runChecks(): Promise<HealthCheckResponse>;

  /** Quick liveness check (always true if process is running) */
  isAlive(): boolean;

  /** Full readiness check (true if no failures) */
  isReady(): Promise<boolean>;

  /** Get uptime in seconds */
  getUptime(): number;

  /** Get version string */
  getVersion(): string;
}
```

### Types

```typescript
interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  timestamp?: string;
}

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: {
    [name: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      timestamp?: string;
    };
  };
  version?: string;
  uptime?: number;  // seconds
}

type HealthCheckFn = () => Promise<CheckResult> | CheckResult;

interface BuiltInCheckOptions {
  /** Memory usage warning threshold (0-1). Default: 0.9 */
  memoryThreshold?: number;
  /** Event loop lag warning threshold in ms. Default: 100 */
  eventLoopLagThreshold?: number;
  /** ShutdownManager for shutdown state check */
  shutdownManager?: ShutdownManager;
}
```

### Built-in Check Functions

| Function | Description |
|----------|-------------|
| `createMemoryCheck(threshold?)` | Check heap usage against threshold |
| `createEventLoopCheck(threshold?)` | Check event loop lag |
| `createShutdownCheck(shutdownManager)` | Check if server is shutting down |
| `registerBuiltInChecks(checker, options?)` | Register all built-in checks |

### Express Middleware

```typescript
import { healthMiddleware, HealthChecker } from 'mcp-reference-server';

const healthChecker = new HealthChecker({ version: '1.0.0' });
registerBuiltInChecks(healthChecker);

app.use(healthMiddleware(healthChecker));
// Provides:
// GET /health - Liveness (always 200)
// GET /ready  - Readiness (200 or 503)
```

### Usage

```typescript
import {
  HealthChecker,
  registerBuiltInChecks,
  healthMiddleware,
} from 'mcp-reference-server';

const healthChecker = new HealthChecker({ version: '1.0.0' });

// Register built-in checks
registerBuiltInChecks(healthChecker, {
  memoryThreshold: 0.9,
  eventLoopLagThreshold: 100,
});

// Register custom check
healthChecker.registerCheck('database', async () => {
  const connected = await db.ping();
  return {
    status: connected ? 'pass' : 'fail',
    message: connected ? 'Connected' : 'Connection failed',
  };
});

// Check readiness
if (await healthChecker.isReady()) {
  console.log('Server is ready');
}
```

## Metrics (`observability/metrics`)

OpenTelemetry-based metrics collection for MCP server monitoring.

### Constants

```typescript
import { METRIC_NAMES, DURATION_BUCKETS } from 'mcp-reference-server';

METRIC_NAMES.REQUESTS_TOTAL     // 'mcp.requests.total'
METRIC_NAMES.REQUESTS_DURATION  // 'mcp.requests.duration'
METRIC_NAMES.ERRORS_TOTAL       // 'mcp.errors.total'
METRIC_NAMES.SESSIONS_ACTIVE    // 'mcp.sessions.active'

// Histogram bucket boundaries (milliseconds)
DURATION_BUCKETS  // [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
```

### Types

```typescript
interface MetricsSummary {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
  };
  errors: {
    total: number;
    byCode: Record<string, number>;
  };
  sessions: {
    active: number;
  };
}

type RequestStatus = 'success' | 'error';
type TransportType = 'stdio' | 'http';
```

### MetricsCollector Class

```typescript
class MetricsCollector {
  constructor(meter: Meter);

  /** Record a completed request */
  recordRequest(
    method: string,
    durationMs: number,
    status: RequestStatus,
    transport?: TransportType
  ): void;

  /** Record an error */
  recordError(
    errorCode: number | string,
    method?: string,
    transport?: TransportType
  ): void;

  /** Record session start */
  sessionStarted(): void;

  /** Record session end */
  sessionEnded(): void;

  /** Get metrics summary (for testing/debugging) */
  getMetrics(): MetricsSummary;

  /** Reset internal counters (for testing) */
  resetMetrics(): void;
}
```

### Factory Function

```typescript
function createMetricsCollector(
  telemetry: TelemetryManager,
  meterName?: string  // default: 'mcp-server'
): MetricsCollector;
```

### Usage

```typescript
import { TelemetryManager, createMetricsCollector } from 'mcp-reference-server';

const telemetry = new TelemetryManager({ serviceName: 'my-mcp-server' });
await telemetry.start();

const metrics = createMetricsCollector(telemetry);

// Record a successful request
metrics.recordRequest('tools/call', 42, 'success', 'http');

// Record an error
metrics.recordError(-32600, 'tools/call', 'http');

// Track sessions
metrics.sessionStarted();
// ... later
metrics.sessionEnded();

// Get summary (for debugging)
const summary = metrics.getMetrics();
console.log(summary.requests.total);
```

## Tracing (`observability/tracing`)

Distributed tracing support with W3C Trace Context propagation.

### Types

```typescript
interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
}

interface Span {
  setStatus(status: 'ok' | 'error', message?: string): void;
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  end(): void;
}

interface TracerOptions {
  name: string;
  version?: string;
}
```

### Tracer Class

```typescript
class Tracer {
  constructor(options: TracerOptions);

  /** Get tracer name */
  getName(): string;

  /** Start a new span */
  startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): Span;

  /** Extract trace context from headers (W3C Trace Context) */
  extractContext(headers: Record<string, string>): SpanContext | null;

  /** Inject trace context into headers */
  injectContext(context: SpanContext): Record<string, string>;
}
```

### Factory Function

```typescript
function createTracer(options: TracerOptions): Tracer;
```

### Usage

```typescript
import { createTracer } from 'mcp-reference-server';

const tracer = createTracer({
  name: 'mcp-server',
  version: '1.0.0',
});

// Start a span for an operation
const span = tracer.startSpan('tools/call', {
  'mcp.method': 'tools/call',
  'mcp.tool': 'calculate',
});

try {
  // Do work
  span.setAttribute('result.type', 'success');
  span.setStatus('ok');
} catch (error) {
  span.setStatus('error', error.message);
  span.addEvent('exception', { message: error.message });
} finally {
  span.end();
}
```

### Context Propagation

```typescript
// Extract context from incoming request
const parentContext = tracer.extractContext(request.headers);

// Inject context for outgoing request
const headers = tracer.injectContext(spanContext);
```

## Related

- [Observability Guide](../guides/observability) - Concepts and setup
- [Environment Reference](../reference/environment) - Configuration variables
