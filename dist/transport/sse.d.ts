/**
 * Server-Sent Events stream with replay capability
 *
 * Implements SSE streaming for MCP with:
 * - Event ID format: "<session>:<sequence>" per SEP-1699
 * - Replay support via Last-Event-Id header
 * - Configurable event buffer per session
 */
import type { Response } from 'express';
import type { JsonRpcMessage } from '../protocol/jsonrpc.js';
export interface SSEEvent {
    id: string;
    event?: string;
    data: string;
}
export interface SSEManagerOptions {
    /**
     * Number of events to buffer for replay. Default: 100
     */
    bufferSize?: number;
    /**
     * Keep-alive interval in milliseconds. Default: 30000 (30 seconds)
     * Set to 0 to disable keep-alive pings
     */
    keepAliveInterval?: number;
}
/**
 * Represents an active SSE stream for a single session
 */
export declare class SSEStream {
    private readonly res;
    private readonly sessionId;
    private sequence;
    private active;
    private keepAliveTimer;
    private readonly eventBuffer;
    private readonly bufferSize;
    constructor(res: Response, sessionId: string, options?: {
        bufferSize?: number;
        keepAliveInterval?: number;
    });
    /**
     * Get whether the stream is still active
     */
    get isActive(): boolean;
    /**
     * Get the current sequence number
     */
    get currentSequence(): number;
    /**
     * Get the session ID for this stream
     */
    getSessionId(): string;
    /**
     * Get the event buffer (for replay)
     */
    getBuffer(): SSEEvent[];
    /**
     * Send a JSON-RPC message as an SSE event
     */
    send(message: JsonRpcMessage): void;
    /**
     * Send an event with a specific event type
     */
    sendWithType(message: JsonRpcMessage, eventType: string): void;
    /**
     * Send a comment (used for keep-alive pings)
     */
    sendComment(comment: string): void;
    /**
     * Replay a raw SSE event (preserves original event ID)
     * Used for replaying buffered events on reconnection
     */
    replayEvent(event: SSEEvent): void;
    /**
     * Parse event ID to extract sequence number
     */
    private parseEventIdSequence;
    /**
     * Close the SSE stream
     */
    close(): void;
    /**
     * Write an SSE event to the response
     */
    private writeEvent;
    /**
     * Add event to buffer, maintaining max size
     */
    private addToBuffer;
    /**
     * Stop keep-alive timer
     */
    private stopKeepAlive;
}
/**
 * Manages SSE streams for multiple sessions with replay support
 */
export declare class SSEManager {
    private readonly streams;
    private readonly bufferSize;
    private readonly keepAliveInterval;
    constructor(options?: SSEManagerOptions);
    /**
     * Create a new SSE stream for a session
     */
    createStream(sessionId: string, res: Response): SSEStream;
    /**
     * Get an existing stream for a session
     */
    getStream(sessionId: string): SSEStream | undefined;
    /**
     * Send an event to a specific session
     */
    sendEvent(sessionId: string, message: JsonRpcMessage): boolean;
    /**
     * Send an event with a specific type to a session
     */
    sendEventWithType(sessionId: string, message: JsonRpcMessage, eventType: string): boolean;
    /**
     * Handle reconnection with Last-Event-Id header
     * Creates a new stream and replays events after the given event ID
     */
    handleReconnect(sessionId: string, lastEventId: string, res: Response): SSEStream;
    /**
     * Close stream for a session
     */
    closeStream(sessionId: string): void;
    /**
     * Close all streams
     */
    closeAll(): void;
    /**
     * Get number of active streams
     */
    get size(): number;
    /**
     * Check if a session has an active stream
     */
    hasStream(sessionId: string): boolean;
    /**
     * Parse event ID to extract sequence number
     * Event ID format: "<session>:<sequence>"
     */
    private parseEventIdSequence;
    /**
     * Replay buffered events to a stream after a given sequence
     */
    private replayEvents;
}
export interface SseMessage {
    id?: string;
    event?: string;
    data: string;
    retry?: number;
}
export interface SseStreamOptions {
    replayBufferSize?: number;
}
/**
 * @deprecated Use SSEStream instead
 */
export declare class SseStream {
    private readonly buffer;
    constructor(_options?: SseStreamOptions);
    getBuffer(): SseMessage[];
    send(_message: SseMessage): void;
    replay(_fromId: string): SseMessage[];
    close(): void;
}
//# sourceMappingURL=sse.d.ts.map