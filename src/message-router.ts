/**
 * Central Message Router for MCP Server
 *
 * Routes JSON-RPC messages to appropriate handlers based on method name.
 * Performs lifecycle validation before processing.
 */

import type { Config } from './config.js';
import type { LifecycleManager } from './protocol/lifecycle.js';
import { LifecycleError } from './protocol/lifecycle.js';
import type { ToolRegistry } from './tools/registry.js';
import type { ToolExecutor } from './tools/executor.js';
import {
  handleToolsList,
  handleToolsCall,
  ToolsListParamsSchema,
  ToolsCallParamsSchema,
} from './tools/executor.js';
import type { CompletionHandler } from './completions/handler.js';
import { CompletionParamsSchema } from './completions/handler.js';
import type { LoggingHandler } from './logging/handler.js';
import type { Session } from './transport/session.js';
import {
  type JsonRpcRequest,
  type JsonRpcNotification,
  type JsonRpcResponse,
  createSuccessResponse,
  createErrorResponse,
  createJsonRpcError,
  createMethodNotFoundResponse,
  JsonRpcErrorCodes,
  isRequest,
} from './protocol/jsonrpc.js';

// =============================================================================
// Types
// =============================================================================

export interface MessageRouterOptions {
  lifecycleManager: LifecycleManager;
  toolRegistry: ToolRegistry;
  toolExecutor: ToolExecutor;
  completionHandler: CompletionHandler;
  loggingHandler: LoggingHandler;
  config: Config;
}

export interface SessionContext {
  session?: Session;
}

// =============================================================================
// MessageRouter Class
// =============================================================================

/**
 * Central message router that connects transports to handlers.
 *
 * Responsibilities:
 * - Validates lifecycle state before processing messages
 * - Routes messages to appropriate handlers based on method
 * - Converts handler results to JSON-RPC responses
 */
export class MessageRouter {
  private readonly lifecycleManager: LifecycleManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly toolExecutor: ToolExecutor;
  private readonly completionHandler: CompletionHandler;
  private readonly loggingHandler: LoggingHandler;

  constructor(options: MessageRouterOptions) {
    this.lifecycleManager = options.lifecycleManager;
    this.toolRegistry = options.toolRegistry;
    this.toolExecutor = options.toolExecutor;
    this.completionHandler = options.completionHandler;
    this.loggingHandler = options.loggingHandler;
    // config is available in options if needed for future use
  }

  /**
   * Route a JSON-RPC message to the appropriate handler.
   *
   * @param message - The JSON-RPC request or notification
   * @param context - Optional session context
   * @returns JSON-RPC response for requests, null for notifications
   */
  async handleMessage(
    message: JsonRpcRequest | JsonRpcNotification,
    context?: SessionContext
  ): Promise<JsonRpcResponse | null> {
    // Step 1: Check lifecycle state
    const lifecycleError = this.lifecycleManager.checkPreInitialization(message);
    if (lifecycleError) {
      return lifecycleError;
    }

    // Step 2: Route by method
    try {
      return await this.routeMessage(message, context);
    } catch (error) {
      // Handle errors
      if (isRequest(message)) {
        if (error instanceof LifecycleError) {
          return createErrorResponse(message.id, error.toJsonRpcError());
        }

        const errorMessage = error instanceof Error ? error.message : 'Internal error';
        return createErrorResponse(
          message.id,
          createJsonRpcError(JsonRpcErrorCodes.INTERNAL_ERROR, errorMessage)
        );
      }

      // For notifications, we can't return an error response
      // Log it instead
      console.error(`Error handling notification ${message.method}:`, error);
      return null;
    }
  }

  /**
   * Route a message to the appropriate handler based on method.
   */
  private async routeMessage(
    message: JsonRpcRequest | JsonRpcNotification,
    _context?: SessionContext
  ): Promise<JsonRpcResponse | null> {
    const { method, params } = message;
    const id = isRequest(message) ? message.id : null;

    switch (method) {
      // =================================================================
      // Lifecycle Methods
      // =================================================================
      case 'initialize': {
        const result = this.lifecycleManager.handleInitialize(params);
        return createSuccessResponse(id!, result);
      }

      case 'notifications/initialized': {
        this.lifecycleManager.handleInitialized();
        return null; // Notification - no response
      }

      // =================================================================
      // Tool Methods
      // =================================================================
      case 'tools/list': {
        const parseResult = ToolsListParamsSchema.safeParse(params);
        const listParams = parseResult.success ? parseResult.data : undefined;
        const result = handleToolsList(this.toolRegistry, listParams);
        return createSuccessResponse(id!, result);
      }

      case 'tools/call': {
        const parseResult = ToolsCallParamsSchema.safeParse(params);
        if (!parseResult.success) {
          return createErrorResponse(
            id!,
            createJsonRpcError(
              JsonRpcErrorCodes.INVALID_PARAMS,
              'Invalid params for tools/call',
              parseResult.error.format()
            )
          );
        }
        const result = await handleToolsCall(this.toolExecutor, parseResult.data);
        return createSuccessResponse(id!, result);
      }

      // =================================================================
      // Completion Methods
      // =================================================================
      case 'completion/complete': {
        const parseResult = CompletionParamsSchema.safeParse(params);
        if (!parseResult.success) {
          return createErrorResponse(
            id!,
            createJsonRpcError(
              JsonRpcErrorCodes.INVALID_PARAMS,
              'Invalid params for completion/complete',
              parseResult.error.format()
            )
          );
        }
        const result = await this.completionHandler.handle(parseResult.data);
        return createSuccessResponse(id!, result);
      }

      // =================================================================
      // Logging Methods
      // =================================================================
      case 'logging/setLevel': {
        const result = this.loggingHandler.handleSetLevel(params);
        return createSuccessResponse(id!, result);
      }

      // =================================================================
      // Utility Methods
      // =================================================================
      case 'ping': {
        return createSuccessResponse(id!, {});
      }

      // =================================================================
      // Unknown Method
      // =================================================================
      default: {
        if (isRequest(message)) {
          return createMethodNotFoundResponse(message.id, method);
        }
        // Unknown notification - ignore silently
        return null;
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new MessageRouter instance.
 *
 * @param options - Router options
 * @returns A new MessageRouter instance
 */
export function createMessageRouter(options: MessageRouterOptions): MessageRouter {
  return new MessageRouter(options);
}
