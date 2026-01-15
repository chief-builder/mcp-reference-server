/**
 * Server-Sent Events stream with replay capability
 */
export interface SseMessage {
    id?: string;
    event?: string;
    data: string;
    retry?: number;
}
export interface SseStreamOptions {
    replayBufferSize?: number;
}
export declare class SseStream {
    private readonly buffer;
    constructor(_options?: SseStreamOptions);
    getBuffer(): SseMessage[];
    send(_message: SseMessage): void;
    replay(_fromId: string): SseMessage[];
    close(): void;
}
//# sourceMappingURL=sse.d.ts.map