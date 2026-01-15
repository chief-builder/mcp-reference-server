/**
 * Streamable HTTP transport implementation
 */
import type { Express } from 'express';
export interface HttpTransportOptions {
    port?: number;
    host?: string;
    app?: Express;
}
export declare class HttpTransport {
    constructor(_options?: HttpTransportOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=http.d.ts.map