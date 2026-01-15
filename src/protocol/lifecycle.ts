/**
 * MCP Lifecycle handling - Initialize/shutdown
 *
 * Implements the MCP protocol lifecycle management including:
 * - Server state machine (uninitialized -> initializing -> ready -> shutting_down)
 * - Initialization handshake
 * - Protocol version validation
 * - Pre-initialization request rejection
 * - Graceful shutdown
 */

import { z } from 'zod';
import {
  JsonRpcErrorCodes,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcErrorResponse,
  createErrorResponse,
  createJsonRpcError,
} from './jsonrpc.js';

// =============================================================================
// Constants
// =============================================================================

export const PROTOCOL_VERSION = '2025-11-25' as const;

// =============================================================================
// Server States
// =============================================================================

export type ServerState = 'uninitialized' | 'initializing' | 'ready' | 'shutting_down';

// =============================================================================
// Capability Types
// =============================================================================

export interface ClientCapabilities {
  roots?: {
    listChanged?: boolean | undefined;
  } | undefined;
  sampling?: Record<string, unknown> | undefined;
  experimental?: Record<string, unknown> | undefined;
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

// =============================================================================
// Initialize Types
// =============================================================================

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
    description?: string;
  };
  instructions?: string;
}

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

export const ClientCapabilitiesSchema = z.object({
  roots: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  sampling: z.record(z.unknown()).optional(),
  experimental: z.record(z.unknown()).optional(),
});

export const InitializeParamsSchema = z.object({
  protocolVersion: z.string(),
  capabilities: ClientCapabilitiesSchema,
  clientInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
});

// =============================================================================
// Server Configuration
// =============================================================================

export interface ServerConfig {
  name: string;
  version: string;
  description?: string;
  capabilities?: ServerCapabilities;
  instructions?: string;
}

// =============================================================================
// Lifecycle Manager
// =============================================================================

export class LifecycleManager {
  private state: ServerState = 'uninitialized';
  private clientInfo: { name: string; version: string } | null = null;
  private clientCapabilities: ClientCapabilities | null = null;
  private serverConfig: ServerConfig;

  constructor(config: ServerConfig) {
    this.serverConfig = config;
  }

  /**
   * Get the current server state
   */
  getState(): ServerState {
    return this.state;
  }

  /**
   * Get stored client info (available after initialization)
   */
  getClientInfo(): { name: string; version: string } | null {
    return this.clientInfo;
  }

  /**
   * Get stored client capabilities (available after initialization)
   */
  getClientCapabilities(): ClientCapabilities | null {
    return this.clientCapabilities;
  }

  /**
   * Check if a request should be rejected due to server not being initialized.
   * Returns an error response if request should be rejected, null otherwise.
   */
  checkPreInitialization(
    message: JsonRpcRequest | JsonRpcNotification
  ): JsonRpcErrorResponse | null {
    // Allow initialize request in uninitialized state
    if (message.method === 'initialize' && this.state === 'uninitialized') {
      return null;
    }

    // Allow initialized notification in initializing state
    if (message.method === 'notifications/initialized' && this.state === 'initializing') {
      return null;
    }

    // In ready state, allow all requests
    if (this.state === 'ready') {
      return null;
    }

    // In shutting_down state, reject everything
    if (this.state === 'shutting_down') {
      const id = 'id' in message ? message.id : null;
      return createErrorResponse(
        id,
        createJsonRpcError(
          JsonRpcErrorCodes.INVALID_REQUEST,
          'Server is shutting down'
        )
      );
    }

    // Reject requests in uninitialized or initializing state
    const id = 'id' in message ? message.id : null;
    return createErrorResponse(
      id,
      createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        'Server not initialized. Send initialize request first.'
      )
    );
  }

  /**
   * Handle the initialize request.
   * Returns InitializeResult on success, throws on error.
   */
  handleInitialize(params: unknown): InitializeResult {
    // Validate state
    if (this.state !== 'uninitialized') {
      throw new LifecycleError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        'Server already initialized'
      );
    }

    // Validate params
    const parseResult = InitializeParamsSchema.safeParse(params);
    if (!parseResult.success) {
      throw new LifecycleError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        'Invalid initialize params',
        parseResult.error.format()
      );
    }

    const initParams = parseResult.data;

    // Validate protocol version
    if (initParams.protocolVersion !== PROTOCOL_VERSION) {
      throw new LifecycleError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        `Unsupported protocol version: ${initParams.protocolVersion}. Expected: ${PROTOCOL_VERSION}`,
        { supported: PROTOCOL_VERSION, received: initParams.protocolVersion }
      );
    }

    // Store client info
    this.clientInfo = initParams.clientInfo;
    this.clientCapabilities = initParams.capabilities;

    // Transition to initializing state
    this.state = 'initializing';

    // Build result
    const result: InitializeResult = {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: this.serverConfig.capabilities ?? {},
      serverInfo: {
        name: this.serverConfig.name,
        version: this.serverConfig.version,
      },
    };

    if (this.serverConfig.description) {
      result.serverInfo.description = this.serverConfig.description;
    }

    if (this.serverConfig.instructions) {
      result.instructions = this.serverConfig.instructions;
    }

    return result;
  }

  /**
   * Handle the initialized notification.
   * Transitions server to ready state.
   */
  handleInitialized(): void {
    if (this.state !== 'initializing') {
      throw new LifecycleError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        `Cannot receive initialized notification in ${this.state} state`
      );
    }

    this.state = 'ready';
  }

  /**
   * Initiate server shutdown.
   * Returns true if shutdown was initiated, false if already shutting down.
   */
  initiateShutdown(): boolean {
    if (this.state === 'shutting_down') {
      return false;
    }

    this.state = 'shutting_down';
    return true;
  }

  /**
   * Check if the server is in a state that allows normal operations.
   */
  isOperational(): boolean {
    return this.state === 'ready';
  }

  /**
   * Reset the lifecycle manager to initial state.
   * Useful for testing or server restart scenarios.
   */
  reset(): void {
    this.state = 'uninitialized';
    this.clientInfo = null;
    this.clientCapabilities = null;
  }
}

// =============================================================================
// Lifecycle Error
// =============================================================================

export class LifecycleError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
    this.data = data;
  }

  toJsonRpcError() {
    return createJsonRpcError(this.code, this.message, this.data);
  }
}

// =============================================================================
// Legacy Function Exports (for backwards compatibility)
// =============================================================================

/**
 * @deprecated Use LifecycleManager instead
 */
export async function handleInitialize(_params: InitializeParams): Promise<InitializeResult> {
  throw new Error('Use LifecycleManager.handleInitialize() instead');
}

/**
 * @deprecated Use LifecycleManager instead
 */
export async function handleShutdown(): Promise<void> {
  throw new Error('Use LifecycleManager.initiateShutdown() instead');
}
