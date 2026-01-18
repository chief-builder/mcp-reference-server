---
layout: page
title: Installation
---

# Installation

## Requirements

- **Node.js**: 20.0.0 or higher (LTS recommended)
- **npm**: 10.0.0 or higher

## Install from npm

```bash
npm install mcp-reference-server
```

## Install from Source

```bash
git clone https://github.com/chiefbuilder/mcp-reference-server.git
cd mcp-reference-server
npm install
npm run build
```

## Verify Installation

```bash
# If installed globally or from source
npx mcp-reference-server --version

# Or run the development server
npm run dev
```

## TypeScript Setup

For TypeScript projects, types are included automatically:

```typescript
import { McpServer, StdioTransport, HttpTransport } from 'mcp-reference-server';
```

## Optional Dependencies

For OpenTelemetry observability features:

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

See [Observability Guide](../guides/observability) for setup details.

## Next Steps

- [Quick Start](quick-start) - Create your first MCP server
- [Configuration](configuration) - Environment variables
