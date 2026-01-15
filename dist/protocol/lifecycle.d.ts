/**
 * MCP Lifecycle handling - Initialize/shutdown
 */
export interface InitializeParams {
    protocolVersion: string;
    capabilities: ClientCapabilities;
    clientInfo: {
        name: string;
        version: string;
    };
}
export interface InitializeResult {
    protocolVersion: string;
    capabilities: ServerCapabilities;
    serverInfo: {
        name: string;
        version: string;
    };
}
export interface ClientCapabilities {
    roots?: {
        listChanged?: boolean;
    };
    sampling?: Record<string, unknown>;
    experimental?: Record<string, unknown>;
}
export interface ServerCapabilities {
    tools?: {
        listChanged?: boolean;
    };
    resources?: {
        subscribe?: boolean;
        listChanged?: boolean;
    };
    prompts?: {
        listChanged?: boolean;
    };
    logging?: Record<string, unknown>;
    experimental?: Record<string, unknown>;
}
export declare function handleInitialize(_params: InitializeParams): Promise<InitializeResult>;
export declare function handleShutdown(): Promise<void>;
//# sourceMappingURL=lifecycle.d.ts.map