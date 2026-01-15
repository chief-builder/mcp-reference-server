/**
 * MCP Capability negotiation
 */
import type { ClientCapabilities, ServerCapabilities } from './lifecycle.js';
export interface NegotiatedCapabilities {
    client: ClientCapabilities;
    server: ServerCapabilities;
}
export declare function negotiateCapabilities(_clientCapabilities: ClientCapabilities, _serverCapabilities: ServerCapabilities): NegotiatedCapabilities;
export declare function getDefaultServerCapabilities(): ServerCapabilities;
//# sourceMappingURL=capabilities.d.ts.map