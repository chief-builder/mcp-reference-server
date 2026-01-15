/**
 * MCP Capability negotiation
 */
export function negotiateCapabilities(_clientCapabilities, _serverCapabilities) {
    // TODO: Implement capability negotiation
    throw new Error('Not implemented');
}
export function getDefaultServerCapabilities() {
    return {
        tools: {
            listChanged: true,
        },
        logging: {},
    };
}
//# sourceMappingURL=capabilities.js.map