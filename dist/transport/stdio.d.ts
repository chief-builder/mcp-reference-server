/**
 * stdio transport implementation
 */
export interface StdioTransportOptions {
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
}
export declare class StdioTransport {
    constructor(_options?: StdioTransportOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=stdio.d.ts.map