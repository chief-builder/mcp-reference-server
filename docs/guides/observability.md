---
layout: page
title: Observability Guide
---

# Observability Guide

MCP Reference Server provides comprehensive observability through OpenTelemetry, structured logging, metrics, and health endpoints.

## Overview

| Feature | Description |
|---------|-------------|
| Telemetry | OpenTelemetry traces and spans |
| Metrics | Request counts, latencies, error rates |
| Logging | Structured JSON logging |
| Health | HTTP endpoints for load balancers |
| Debug | Verbose request/response logging |

## OpenTelemetry Setup

### Dependencies

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

### Configuration

```typescript
import { TelemetryManager } from 'mcp-reference-server';

const telemetry = new TelemetryManager({
  serviceName: 'my-mcp-server',
  serviceVersion: '1.0.0',
});

// Start telemetry collection
await telemetry.start();

// On shutdown
await telemetry.shutdown();
```

### Environment Variables

```bash
# Enable telemetry
MCP_TELEMETRY_ENABLED=true

# OpenTelemetry configuration
OTEL_SERVICE_NAME=my-mcp-server
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

## Metrics Collection

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `mcp.requests.total` | Counter | Total requests by method and status |
| `mcp.requests.duration` | Histogram | Request duration in milliseconds |
| `mcp.errors.total` | Counter | Total errors by code |
| `mcp.sessions.active` | Gauge | Currently active sessions |

### Using MetricsCollector

```typescript
import { MetricsCollector, createMetricsCollector } from 'mcp-reference-server';

const metrics = createMetricsCollector(telemetry);

// Record request
metrics.recordRequest('tools/call', 42.5, 'success', 'http');

// Record error
metrics.recordError(-32600, 'tools/call', 'http');

// Track sessions
metrics.sessionStarted();
metrics.sessionEnded();

// Get summary
const summary = metrics.getMetrics();
console.log(summary.requests.total);
console.log(summary.errors.byCode);
```

## Structured Logging

### Logger Configuration

```typescript
import { StructuredLogger } from 'mcp-reference-server';

const logger = new StructuredLogger({
  name: 'my-component',
  minLevel: 'info',
  format: 'json',  // or 'text' for development
});

// Log with context
logger.info('Request processed', {
  method: 'tools/call',
  duration: 42,
  requestId: 'abc123'
});
```

### Log Levels

| Level | Usage |
|-------|-------|
| `debug` | Detailed debugging information |
| `info` | Normal operational messages |
| `warn` | Warning conditions |
| `error` | Error conditions |

### JSON Output Format

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "info",
  "name": "my-component",
  "message": "Request processed",
  "method": "tools/call",
  "duration": 42,
  "requestId": "abc123"
}
```

## Health Endpoints

HTTP transport exposes health check endpoints:

| Endpoint | Description |
|----------|-------------|
| `/health` | Overall health status |
| `/health/ready` | Readiness probe (dependencies ready) |
| `/health/live` | Liveness probe (process alive) |

### Health Response

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": {
    "server": { "status": "healthy" },
    "database": { "status": "healthy", "latency": 5 }
  }
}
```

### Custom Health Checks

```typescript
import { HealthChecker, registerBuiltInChecks } from 'mcp-reference-server';

const health = new HealthChecker({ version: '1.0.0' });
registerBuiltInChecks(health);

// Register custom check
health.registerCheck('database', async () => {
  const start = Date.now();
  await db.ping();
  return {
    status: 'pass',
    message: `Latency: ${Date.now() - start}ms`,
  };
});

// Run all checks
const response = await health.runChecks();
console.log(response.status); // 'healthy', 'degraded', or 'unhealthy'
```

## Debug Mode

Enable verbose logging for development:

```bash
MCP_DEBUG=true
```

### DebugHelper

```typescript
import { DebugHelper } from 'mcp-reference-server';

const debug = new DebugHelper({ enabled: true });

// Log request/response
debug.logRequest('tools/call', params, requestId);
debug.logResponse(requestId, result, durationMs);

// Time async operations
const result = await debug.timeAsync('database-query', async () => {
  return await db.query('SELECT * FROM users');
});

// Dump objects
debug.dump('user-data', userData);
```

### Debug Output

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "debug",
  "name": "debug",
  "message": "Request received",
  "requestId": "req-123",
  "method": "tools/call",
  "params": { "name": "greet", "arguments": { "name": "World" } }
}
```

## Integration Example

```typescript
import {
  McpServer,
  HttpTransport,
  TelemetryManager,
  createMetricsCollector,
  StructuredLogger,
  HealthChecker,
  registerBuiltInChecks,
} from 'mcp-reference-server';

// Initialize observability
const telemetry = new TelemetryManager({
  serviceName: 'my-mcp-server'
});
await telemetry.start();

const metrics = createMetricsCollector(telemetry);
const logger = new StructuredLogger({ name: 'server' });
const health = new HealthChecker({ version: '1.0.0' });
registerBuiltInChecks(health);

// Create server with observability
const server = new McpServer({
  name: 'my-server',
  version: '1.0.0'
});

const transport = new HttpTransport({
  port: 3000,
  metrics,
  health
});

logger.info('Server starting', { port: 3000 });
await server.connect(transport);
```

## Related

- [Observability API Reference](../api/observability) - Full API documentation
- [Configuration](../getting-started/configuration) - Environment variables
- [Environment Reference](../reference/environment) - All MCP_* variables
