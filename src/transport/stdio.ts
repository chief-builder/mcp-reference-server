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
import type { JsonRpcMessage, JsonRpcRequest, JsonRpcNotification } from '../protocol/jsonrpc.js';
import { parseJsonRpc, serializeMessage } from '../protocol/jsonrpc.js';
import type { LifecycleManager } from '../protocol/lifecycle.js';

// =============================================================================
// Types
// =============================================================================

export interface StdioTransportOptions {
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  lifecycleManager?: LifecycleManager;
}

export type MessageHandler = (message: JsonRpcRequest | JsonRpcNotification) => void;
export type ErrorHandler = (error: Error) => void;
export type CloseHandler = () => void;

// =============================================================================
// Constants
// =============================================================================

const NEWLINE = '\n';
const ENCODING = 'utf8' as const;

// =============================================================================
// Custom Events with Type Safety
// =============================================================================

export interface StdioTransportEvents {
  message: [JsonRpcRequest | JsonRpcNotification];
  error: [Error];
  close: [];
}

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
  private readonly stdin: NodeJS.ReadableStream;
  private readonly stdout: NodeJS.WritableStream;
  private readonly stderr: NodeJS.WritableStream;
  private readonly lifecycleManager: LifecycleManager | undefined;

  private buffer: string = '';
  private started: boolean = false;
  private closed: boolean = false;

  // Event emitters
  private readonly messageEmitter = new EventEmitter();
  private readonly errorEmitter = new EventEmitter();
  private readonly closeEmitter = new EventEmitter();

  // Bound handlers for cleanup
  private readonly boundOnData: (chunk: Buffer | string) => void;
  private readonly boundOnEnd: () => void;
  private readonly boundOnError: (error: Error) => void;
  private readonly boundOnSigterm: () => void;
  private readonly boundOnSigint: () => void;

  constructor(options?: StdioTransportOptions) {
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
  start(): void {
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
  send(message: JsonRpcMessage): void {
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
  log(message: string): void {
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
  async close(): Promise<void> {
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
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Check if the transport has been started.
   */
  isStarted(): boolean {
    return this.started;
  }

  // ===========================================================================
  // Event Registration
  // ===========================================================================

  /**
   * Register a handler for incoming messages.
   */
  onMessage(handler: MessageHandler): void {
    this.messageEmitter.on('message', handler);
  }

  /**
   * Remove a message handler.
   */
  offMessage(handler: MessageHandler): void {
    this.messageEmitter.off('message', handler);
  }

  /**
   * Register a handler for errors.
   */
  onError(handler: ErrorHandler): void {
    this.errorEmitter.on('error', handler);
  }

  /**
   * Remove an error handler.
   */
  offError(handler: ErrorHandler): void {
    this.errorEmitter.off('error', handler);
  }

  /**
   * Register a handler for close events.
   */
  onClose(handler: CloseHandler): void {
    this.closeEmitter.on('close', handler);
  }

  /**
   * Remove a close handler.
   */
  offClose(handler: CloseHandler): void {
    this.closeEmitter.off('close', handler);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Handle incoming data from stdin.
   * Buffers partial lines and processes complete ones.
   */
  private handleData(chunk: Buffer | string): void {
    const data = typeof chunk === 'string' ? chunk : chunk.toString(ENCODING);
    this.buffer += data;
    this.processBuffer();
  }

  /**
   * Process the buffer, extracting complete lines.
   */
  private processBuffer(): void {
    let newlineIndex: number;

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
  private processLine(line: string): void {
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
  private handleEnd(): void {
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
  private handleError(error: Error): void {
    this.errorEmitter.emit('error', error);
  }

  /**
   * Handle process signals for graceful shutdown.
   */
  private handleSignal(signal: string): void {
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
export function createStdioTransport(options?: StdioTransportOptions): StdioTransport {
  return new StdioTransport(options);
}
