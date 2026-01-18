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
import { EventEmitter } from 'events';
import { parseJsonRpc, serializeMessage } from '../protocol/jsonrpc.js';
// =============================================================================
// Constants
// =============================================================================
const NEWLINE = '\n';
const ENCODING = 'utf8';
const MAX_LINE_LENGTH = 1024 * 1024; // 1MB limit for buffered lines
// =============================================================================
// StdioTransport Class
// =============================================================================
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
export class StdioTransport {
    stdin;
    stdout;
    stderr;
    lifecycleManager;
    buffer = '';
    started = false;
    closed = false;
    // Event emitters
    messageEmitter = new EventEmitter();
    errorEmitter = new EventEmitter();
    closeEmitter = new EventEmitter();
    // Bound handlers for cleanup
    boundOnData;
    boundOnEnd;
    boundOnError;
    boundOnSigterm;
    boundOnSigint;
    constructor(options) {
        this.stdin = options?.stdin ?? process.stdin;
        this.stdout = options?.stdout ?? process.stdout;
        this.stderr = options?.stderr ?? process.stderr;
        this.lifecycleManager = options?.lifecycleManager;
        // Bind handlers for proper cleanup
        this.boundOnData = this.handleData.bind(this);
        this.boundOnEnd = this.handleEnd.bind(this);
        this.boundOnError = this.handleError.bind(this);
        this.boundOnSigterm = this.handleSignal.bind(this, 'SIGTERM');
        this.boundOnSigint = this.handleSignal.bind(this, 'SIGINT');
    }
    // ===========================================================================
    // Public API
    // ===========================================================================
    /**
     * Begin reading from stdin.
     * Sets up event listeners for data, end, and error events.
     */
    start() {
        if (this.started) {
            return;
        }
        if (this.closed) {
            throw new Error('Cannot start a closed transport');
        }
        this.started = true;
        // Set encoding for stdin if it supports it
        if ('setEncoding' in this.stdin && typeof this.stdin.setEncoding === 'function') {
            this.stdin.setEncoding(ENCODING);
        }
        // Attach stdin listeners
        this.stdin.on('data', this.boundOnData);
        this.stdin.on('end', this.boundOnEnd);
        this.stdin.on('error', this.boundOnError);
        // Attach signal handlers
        process.on('SIGTERM', this.boundOnSigterm);
        process.on('SIGINT', this.boundOnSigint);
    }
    /**
     * Write a JSON-RPC message to stdout.
     * Serializes the message, appends newline, and flushes.
     *
     * @param message - The JSON-RPC message to send
     * @throws Error if transport is closed
     */
    send(message) {
        if (this.closed) {
            throw new Error('Cannot send on a closed transport');
        }
        const serialized = serializeMessage(message);
        const line = serialized + NEWLINE;
        // Write and ensure flush
        this.stdout.write(line, ENCODING);
    }
    /**
     * Write a log message to stderr.
     *
     * @param message - The log message to write
     */
    log(message) {
        if (this.closed) {
            return;
        }
        this.stderr.write(message + NEWLINE, ENCODING);
    }
    /**
     * Graceful shutdown of the transport.
     * Removes event listeners and signals completion.
     *
     * @returns Promise that resolves when shutdown is complete
     */
    async close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        // Notify lifecycle manager if present
        if (this.lifecycleManager) {
            this.lifecycleManager.initiateShutdown();
        }
        // Remove stdin listeners
        this.stdin.removeListener('data', this.boundOnData);
        this.stdin.removeListener('end', this.boundOnEnd);
        this.stdin.removeListener('error', this.boundOnError);
        // Remove signal handlers
        process.removeListener('SIGTERM', this.boundOnSigterm);
        process.removeListener('SIGINT', this.boundOnSigint);
        // Emit close event
        this.closeEmitter.emit('close');
        // Process any remaining buffer
        this.processBuffer();
    }
    /**
     * Check if the transport is closed.
     */
    isClosed() {
        return this.closed;
    }
    /**
     * Check if the transport has been started.
     */
    isStarted() {
        return this.started;
    }
    // ===========================================================================
    // Event Registration
    // ===========================================================================
    /**
     * Register a handler for incoming messages.
     */
    onMessage(handler) {
        this.messageEmitter.on('message', handler);
    }
    /**
     * Remove a message handler.
     */
    offMessage(handler) {
        this.messageEmitter.off('message', handler);
    }
    /**
     * Register a handler for errors.
     */
    onError(handler) {
        this.errorEmitter.on('error', handler);
    }
    /**
     * Remove an error handler.
     */
    offError(handler) {
        this.errorEmitter.off('error', handler);
    }
    /**
     * Register a handler for close events.
     */
    onClose(handler) {
        this.closeEmitter.on('close', handler);
    }
    /**
     * Remove a close handler.
     */
    offClose(handler) {
        this.closeEmitter.off('close', handler);
    }
    // ===========================================================================
    // Private Methods
    // ===========================================================================
    /**
     * Handle incoming data from stdin.
     * Buffers partial lines and processes complete ones.
     * Enforces MAX_LINE_LENGTH to prevent memory exhaustion.
     */
    handleData(chunk) {
        const data = typeof chunk === 'string' ? chunk : chunk.toString(ENCODING);
        this.buffer += data;
        // Check buffer size limit before finding newline to prevent memory exhaustion
        if (this.buffer.length > MAX_LINE_LENGTH && this.buffer.indexOf(NEWLINE) === -1) {
            this.errorEmitter.emit('error', new Error(`Line exceeds maximum length of ${MAX_LINE_LENGTH} bytes`));
            this.buffer = '';
            return;
        }
        this.processBuffer();
    }
    /**
     * Process the buffer, extracting complete lines.
     */
    processBuffer() {
        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf(NEWLINE)) !== -1) {
            const line = this.buffer.substring(0, newlineIndex);
            this.buffer = this.buffer.substring(newlineIndex + 1);
            // Skip empty lines
            if (line.trim().length === 0) {
                continue;
            }
            this.processLine(line);
        }
    }
    /**
     * Process a single line as a JSON-RPC message.
     */
    processLine(line) {
        const result = parseJsonRpc(line);
        if (!result.success) {
            // Emit parsing error
            const error = new Error(`JSON-RPC parse error: ${result.error.message}`);
            this.errorEmitter.emit('error', error);
            return;
        }
        // Emit the parsed message
        this.messageEmitter.emit('message', result.data);
    }
    /**
     * Handle stdin end event.
     */
    handleEnd() {
        // Process any remaining data in buffer (partial line without newline)
        if (this.buffer.trim().length > 0) {
            this.processLine(this.buffer);
            this.buffer = '';
        }
        // Close the transport
        void this.close();
    }
    /**
     * Handle stdin error event.
     */
    handleError(error) {
        this.errorEmitter.emit('error', error);
    }
    /**
     * Handle process signals for graceful shutdown.
     */
    handleSignal(signal) {
        this.log(`Received ${signal}, initiating graceful shutdown...`);
        void this.close().then(() => {
            // Exit cleanly with code 0 for graceful shutdown
            process.exit(0);
        });
    }
}
// =============================================================================
// Factory Function
// =============================================================================
/**
 * Create a new StdioTransport instance.
 *
 * @param options - Optional configuration
 * @returns A new StdioTransport instance
 */
export function createStdioTransport(options) {
    return new StdioTransport(options);
}
//# sourceMappingURL=stdio.js.map