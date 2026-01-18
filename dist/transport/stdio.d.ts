/**
 * stdio transport implementation
 *
 * Implements newline-delimited JSON (NDJSON) framing over stdin/stdout/stderr
 * for MCP protocol communication per the 2025-11-25 specification.
 *
 * Stream usage:
 * - stdin: Server reads client messages
 * - stdout: Server writes responses and notifications
 * - stderr: Server writes log output (all severity levels)
 *
 * Message format: UTF-8 encoded JSON, one object per line, no length prefix.
 */
import type { JsonRpcMessage, JsonRpcRequest, JsonRpcNotification } from '../protocol/jsonrpc.js';
import type { LifecycleManager } from '../protocol/lifecycle.js';
export interface StdioTransportOptions {
    stdin?: NodeJS.ReadableStream;
    stdout?: NodeJS.WritableStream;
    stderr?: NodeJS.WritableStream;
    lifecycleManager?: LifecycleManager;
}
export type MessageHandler = (message: JsonRpcRequest | JsonRpcNotification) => void;
export type ErrorHandler = (error: Error) => void;
export type CloseHandler = () => void;
export interface StdioTransportEvents {
    message: [JsonRpcRequest | JsonRpcNotification];
    error: [Error];
    close: [];
}
/**
 * Stdio transport for MCP protocol communication.
 *
 * Handles:
 * - Newline-delimited JSON message framing
 * - UTF-8 encoding
 * - Buffered stdin reading
 * - Flushed stdout writing
 * - Signal handling (SIGTERM/SIGINT)
 * - Graceful shutdown
 */
export declare class StdioTransport {
    private readonly stdin;
    private readonly stdout;
    private readonly stderr;
    private readonly lifecycleManager;
    private buffer;
    private started;
    private closed;
    private readonly messageEmitter;
    private readonly errorEmitter;
    private readonly closeEmitter;
    private readonly boundOnData;
    private readonly boundOnEnd;
    private readonly boundOnError;
    private readonly boundOnSigterm;
    private readonly boundOnSigint;
    constructor(options?: StdioTransportOptions);
    /**
     * Begin reading from stdin.
     * Sets up event listeners for data, end, and error events.
     */
    start(): void;
    /**
     * Write a JSON-RPC message to stdout.
     * Serializes the message, appends newline, and flushes.
     *
     * @param message - The JSON-RPC message to send
     * @throws Error if transport is closed
     */
    send(message: JsonRpcMessage): void;
    /**
     * Write a log message to stderr.
     *
     * @param message - The log message to write
     */
    log(message: string): void;
    /**
     * Graceful shutdown of the transport.
     * Removes event listeners and signals completion.
     *
     * @returns Promise that resolves when shutdown is complete
     */
    close(): Promise<void>;
    /**
     * Check if the transport is closed.
     */
    isClosed(): boolean;
    /**
     * Check if the transport has been started.
     */
    isStarted(): boolean;
    /**
     * Register a handler for incoming messages.
     */
    onMessage(handler: MessageHandler): void;
    /**
     * Remove a message handler.
     */
    offMessage(handler: MessageHandler): void;
    /**
     * Register a handler for errors.
     */
    onError(handler: ErrorHandler): void;
    /**
     * Remove an error handler.
     */
    offError(handler: ErrorHandler): void;
    /**
     * Register a handler for close events.
     */
    onClose(handler: CloseHandler): void;
    /**
     * Remove a close handler.
     */
    offClose(handler: CloseHandler): void;
    /**
     * Handle incoming data from stdin.
     * Buffers partial lines and processes complete ones.
     * Enforces MAX_LINE_LENGTH to prevent memory exhaustion.
     */
    private handleData;
    /**
     * Process the buffer, extracting complete lines.
     */
    private processBuffer;
    /**
     * Process a single line as a JSON-RPC message.
     */
    private processLine;
    /**
     * Handle stdin end event.
     */
    private handleEnd;
    /**
     * Handle stdin error event.
     */
    private handleError;
    /**
     * Handle process signals for graceful shutdown.
     */
    private handleSignal;
}
/**
 * Create a new StdioTransport instance.
 *
 * @param options - Optional configuration
 * @returns A new StdioTransport instance
 */
export declare function createStdioTransport(options?: StdioTransportOptions): StdioTransport;
//# sourceMappingURL=stdio.d.ts.map