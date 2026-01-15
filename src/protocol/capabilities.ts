/**
 * MCP Capability negotiation
 */

import type { ClientCapabilities, ServerCapabilities } from './lifecycle.js';

export interface NegotiatedCapabilities {
  client: ClientCapabilities;
  server: ServerCapabilities;
}

export function negotiateCapabilities(
  _clientCapabilities: ClientCapabilities,
  _serverCapabilities: ServerCapabilities
): NegotiatedCapabilities {
  // TODO: Implement capability negotiation
  throw new Error('Not implemented');
}

export function getDefaultServerCapabilities(): ServerCapabilities {
  return {
    tools: {
      listChanged: true,
    },
    logging: {},
  };
}
