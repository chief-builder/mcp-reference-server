---
layout: page
title: Authentication Guide
---

# Authentication Guide

MCP supports OAuth 2.1 authentication for HTTP transport with PKCE and machine-to-machine (M2M) flows.

## Overview

Authentication is optional and disabled by default. When enabled:

- Clients must obtain tokens from an OAuth authorization server
- Servers validate tokens on each request
- Scopes control access to specific capabilities

## OAuth 2.1 with PKCE

For interactive applications with user authentication.

### Flow

```
┌──────────┐     ┌──────────────┐     ┌────────────┐
│  Client  │     │ Auth Server  │     │ MCP Server │
└────┬─────┘     └──────┬───────┘     └─────┬──────┘
     │                  │                   │
     │ 1. Auth request  │                   │
     │ + code_challenge │                   │
     ├─────────────────►│                   │
     │                  │                   │
     │ 2. Auth code     │                   │
     │◄─────────────────┤                   │
     │                  │                   │
     │ 3. Token request │                   │
     │ + code_verifier  │                   │
     ├─────────────────►│                   │
     │                  │                   │
     │ 4. Access token  │                   │
     │◄─────────────────┤                   │
     │                  │                   │
     │ 5. MCP request   │                   │
     │ + Bearer token   ├──────────────────►│
     │                  │                   │
```

### PKCE Parameters

```typescript
// Generate code verifier (43-128 chars)
const codeVerifier = generateCodeVerifier();

// Create code challenge
const codeChallenge = base64url(sha256(codeVerifier));

// Authorization request
GET /authorize?
  response_type=code&
  client_id=my-client&
  redirect_uri=http://localhost:3000/callback&
  code_challenge=abc123...&
  code_challenge_method=S256&
  scope=mcp:write
```

## Machine-to-Machine (M2M)

For server-to-server communication without user interaction.

### Client Credentials Flow

```typescript
// Request token
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id=my-service&
client_secret=secret123&
scope=mcp:write
```

### Response

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "mcp:write"
}
```

## Protected Resource Metadata

Servers expose OAuth metadata per RFC 9728:

```
GET /.well-known/oauth-protected-resource
```

Response:

```json
{
  "resource": "https://mcp.example.com",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["mcp:read", "mcp:write", "mcp:admin"],
  "bearer_methods_supported": ["header"]
}
```

## Scopes

MCP uses a hierarchical scope system for access control.

### Base Scopes

| Scope | Access |
|-------|--------|
| `mcp:read` | Read-only operations (tools/list, resources/list, etc.) |
| `mcp:write` | Write operations (tools/call, resources/subscribe, etc.) |
| `mcp:admin` | Administrative operations (server/shutdown) |

### Tool-Specific Scopes

For fine-grained control, use tool-specific scopes:

| Scope | Access |
|-------|--------|
| `mcp:tool:calculate` | Access to the calculate tool |
| `mcp:tool:roll_dice` | Access to the roll_dice tool |
| `mcp:tool:tell_fortune` | Access to the tell_fortune tool |

### Scope Inheritance (SEP-835)

Parent scopes imply child permissions:

```
mcp:admin → includes mcp:write → includes mcp:read
```

## Server Configuration

### Environment Variables

```bash
MCP_AUTH_ENABLED=true
MCP_AUTH_ISSUER=https://auth.example.com
MCP_AUTH_CLIENT_ID=my-mcp-server
MCP_AUTH_SCOPES=mcp:read mcp:write
```

### Programmatic

```typescript
import { McpServer, HttpTransport, OAuthValidator } from 'mcp-reference-server';

const validator = new OAuthValidator({
  issuer: 'https://auth.example.com',
  audience: 'my-mcp-server',
});

const transport = new HttpTransport({
  port: 3000,
  authValidator: validator,
});

const server = new McpServer({ name: 'my-server', version: '1.0.0' });
await server.connect(transport);
```

## Token Validation

Servers validate tokens on each request:

1. Extract `Authorization: Bearer <token>` header
2. Verify token signature (JWT) or introspect (opaque)
3. Check expiration, issuer, audience
4. Verify required scopes
5. Allow or reject request

### JWT Validation

```typescript
const validator = new OAuthValidator({
  issuer: 'https://auth.example.com',
  audience: 'my-mcp-server',
  jwksUri: 'https://auth.example.com/.well-known/jwks.json',
});
```

### Token Introspection

```typescript
const validator = new OAuthValidator({
  issuer: 'https://auth.example.com',
  introspectionEndpoint: 'https://auth.example.com/introspect',
  clientId: 'my-mcp-server',
  clientSecret: 'secret',
});
```

## Error Responses

Authentication failures return appropriate HTTP status:

| Status | Description |
|--------|-------------|
| 401 | Missing or invalid token |
| 403 | Insufficient scope |

```json
{
  "error": "insufficient_scope",
  "error_description": "Token does not have required scope: mcp:write"
}
```

## Related

- [Transports Guide](transports) - HTTP transport setup
- [Environment Reference](../reference/environment) - Auth variables
