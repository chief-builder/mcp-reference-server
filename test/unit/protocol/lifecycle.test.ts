import { describe, it, expect, beforeEach } from 'vitest';
import {
  PROTOCOL_VERSION,
  LifecycleManager,
  LifecycleError,
  ServerConfig,
  InitializeParams,
  InitializeParamsSchema,
  ClientCapabilitiesSchema,
} from '../../../src/protocol/lifecycle.js';
import {
  JsonRpcErrorCodes,
  createRequest,
  createNotification,
} from '../../../src/protocol/jsonrpc.js';

describe('Lifecycle Management', () => {
  describe('Constants', () => {
    it('should have correct protocol version', () => {
      expect(PROTOCOL_VERSION).toBe('2025-11-25');
    });
  });

  describe('LifecycleManager', () => {
    let manager: LifecycleManager;
    const defaultConfig: ServerConfig = {
      name: 'test-server',
      version: '1.0.0',
    };

    const validInitParams: InitializeParams = {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    };

    beforeEach(() => {
      manager = new LifecycleManager(defaultConfig);
    });

    describe('initial state', () => {
      it('should start in uninitialized state', () => {
        expect(manager.getState()).toBe('uninitialized');
      });

      it('should have no client info initially', () => {
        expect(manager.getClientInfo()).toBe(null);
      });

      it('should have no client capabilities initially', () => {
        expect(manager.getClientCapabilities()).toBe(null);
      });

      it('should not be operational initially', () => {
        expect(manager.isOperational()).toBe(false);
      });
    });

    describe('pre-initialization rejection', () => {
      it('should allow initialize request in uninitialized state', () => {
        const request = createRequest(1, 'initialize', validInitParams);
        const rejection = manager.checkPreInitialization(request);
        expect(rejection).toBe(null);
      });

      it('should reject non-initialize requests in uninitialized state', () => {
        const request = createRequest(1, 'tools/list');
        const rejection = manager.checkPreInitialization(request);
        expect(rejection).not.toBe(null);
        expect(rejection?.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
        expect(rejection?.error.message).toContain('not initialized');
      });

      it('should reject notifications in uninitialized state', () => {
        const notification = createNotification('notifications/cancelled');
        const rejection = manager.checkPreInitialization(notification);
        expect(rejection).not.toBe(null);
        expect(rejection?.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
      });

      it('should allow initialized notification in initializing state', () => {
        manager.handleInitialize(validInitParams);
        expect(manager.getState()).toBe('initializing');

        const notification = createNotification('notifications/initialized');
        const rejection = manager.checkPreInitialization(notification);
        expect(rejection).toBe(null);
      });

      it('should reject other requests in initializing state', () => {
        manager.handleInitialize(validInitParams);

        const request = createRequest(1, 'tools/list');
        const rejection = manager.checkPreInitialization(request);
        expect(rejection).not.toBe(null);
        expect(rejection?.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
      });

      it('should allow requests in ready state', () => {
        manager.handleInitialize(validInitParams);
        manager.handleInitialized();
        expect(manager.getState()).toBe('ready');

        const request = createRequest(1, 'tools/list');
        const rejection = manager.checkPreInitialization(request);
        expect(rejection).toBe(null);
      });

      it('should reject requests in shutting_down state', () => {
        manager.handleInitialize(validInitParams);
        manager.handleInitialized();
        manager.initiateShutdown();
        expect(manager.getState()).toBe('shutting_down');

        const request = createRequest(1, 'tools/list');
        const rejection = manager.checkPreInitialization(request);
        expect(rejection).not.toBe(null);
        expect(rejection?.error.message).toContain('shutting down');
      });

      it('should return error with request id', () => {
        const request = createRequest('req-123', 'tools/list');
        const rejection = manager.checkPreInitialization(request);
        expect(rejection?.id).toBe('req-123');
      });

      it('should return error with null id for notifications', () => {
        const notification = createNotification('notifications/cancelled');
        const rejection = manager.checkPreInitialization(notification);
        expect(rejection?.id).toBe(null);
      });
    });

    describe('handleInitialize', () => {
      it('should accept valid initialize params', () => {
        const result = manager.handleInitialize(validInitParams);
        expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
        expect(result.serverInfo.name).toBe('test-server');
        expect(result.serverInfo.version).toBe('1.0.0');
      });

      it('should transition to initializing state', () => {
        manager.handleInitialize(validInitParams);
        expect(manager.getState()).toBe('initializing');
      });

      it('should store client info', () => {
        manager.handleInitialize(validInitParams);
        expect(manager.getClientInfo()).toEqual({
          name: 'test-client',
          version: '1.0.0',
        });
      });

      it('should store client capabilities', () => {
        const params = {
          ...validInitParams,
          capabilities: {
            roots: { listChanged: true },
          },
        };
        manager.handleInitialize(params);
        expect(manager.getClientCapabilities()).toEqual({
          roots: { listChanged: true },
        });
      });

      it('should return server capabilities from config', () => {
        const configWithCapabilities: ServerConfig = {
          ...defaultConfig,
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: true },
          },
        };
        const managerWithCaps = new LifecycleManager(configWithCapabilities);
        const result = managerWithCaps.handleInitialize(validInitParams);
        expect(result.capabilities).toEqual({
          tools: { listChanged: true },
          resources: { subscribe: true },
        });
      });

      it('should include server description if configured', () => {
        const configWithDescription: ServerConfig = {
          ...defaultConfig,
          description: 'A test MCP server',
        };
        const managerWithDesc = new LifecycleManager(configWithDescription);
        const result = managerWithDesc.handleInitialize(validInitParams);
        expect(result.serverInfo.description).toBe('A test MCP server');
      });

      it('should include instructions if configured', () => {
        const configWithInstructions: ServerConfig = {
          ...defaultConfig,
          instructions: 'Use this server for testing',
        };
        const managerWithInstr = new LifecycleManager(configWithInstructions);
        const result = managerWithInstr.handleInitialize(validInitParams);
        expect(result.instructions).toBe('Use this server for testing');
      });

      it('should reject unsupported protocol version', () => {
        const params = {
          ...validInitParams,
          protocolVersion: '2024-01-01',
        };
        expect(() => manager.handleInitialize(params)).toThrow(LifecycleError);
        try {
          manager.handleInitialize(params);
        } catch (e) {
          expect(e).toBeInstanceOf(LifecycleError);
          const error = e as LifecycleError;
          expect(error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
          expect(error.message).toContain('Unsupported protocol version');
          expect(error.data).toEqual({
            supported: PROTOCOL_VERSION,
            received: '2024-01-01',
          });
        }
      });

      it('should reject if already initialized', () => {
        manager.handleInitialize(validInitParams);
        expect(() => manager.handleInitialize(validInitParams)).toThrow(LifecycleError);
        try {
          manager.handleInitialize(validInitParams);
        } catch (e) {
          const error = e as LifecycleError;
          expect(error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
          expect(error.message).toContain('already initialized');
        }
      });

      it('should reject invalid params', () => {
        expect(() => manager.handleInitialize({})).toThrow(LifecycleError);
        try {
          manager.handleInitialize({});
        } catch (e) {
          const error = e as LifecycleError;
          expect(error.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS);
        }
      });

      it('should reject params missing clientInfo', () => {
        const params = {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
        };
        expect(() => manager.handleInitialize(params)).toThrow(LifecycleError);
      });

      it('should reject params missing capabilities', () => {
        const params = {
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: 'test', version: '1.0.0' },
        };
        expect(() => manager.handleInitialize(params)).toThrow(LifecycleError);
      });
    });

    describe('handleInitialized', () => {
      it('should transition from initializing to ready', () => {
        manager.handleInitialize(validInitParams);
        expect(manager.getState()).toBe('initializing');
        manager.handleInitialized();
        expect(manager.getState()).toBe('ready');
      });

      it('should make server operational', () => {
        manager.handleInitialize(validInitParams);
        manager.handleInitialized();
        expect(manager.isOperational()).toBe(true);
      });

      it('should reject if not in initializing state', () => {
        expect(() => manager.handleInitialized()).toThrow(LifecycleError);
        try {
          manager.handleInitialized();
        } catch (e) {
          const error = e as LifecycleError;
          expect(error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
          expect(error.message).toContain('uninitialized');
        }
      });

      it('should reject if called twice', () => {
        manager.handleInitialize(validInitParams);
        manager.handleInitialized();
        expect(() => manager.handleInitialized()).toThrow(LifecycleError);
      });
    });

    describe('shutdown', () => {
      it('should transition to shutting_down state', () => {
        manager.handleInitialize(validInitParams);
        manager.handleInitialized();
        const result = manager.initiateShutdown();
        expect(result).toBe(true);
        expect(manager.getState()).toBe('shutting_down');
      });

      it('should make server non-operational', () => {
        manager.handleInitialize(validInitParams);
        manager.handleInitialized();
        manager.initiateShutdown();
        expect(manager.isOperational()).toBe(false);
      });

      it('should return false if already shutting down', () => {
        manager.handleInitialize(validInitParams);
        manager.handleInitialized();
        manager.initiateShutdown();
        const result = manager.initiateShutdown();
        expect(result).toBe(false);
      });

      it('should allow shutdown from any state', () => {
        const result = manager.initiateShutdown();
        expect(result).toBe(true);
        expect(manager.getState()).toBe('shutting_down');
      });
    });

    describe('reset', () => {
      it('should return to uninitialized state', () => {
        manager.handleInitialize(validInitParams);
        manager.handleInitialized();
        manager.reset();
        expect(manager.getState()).toBe('uninitialized');
      });

      it('should clear client info', () => {
        manager.handleInitialize(validInitParams);
        manager.reset();
        expect(manager.getClientInfo()).toBe(null);
      });

      it('should clear client capabilities', () => {
        manager.handleInitialize(validInitParams);
        manager.reset();
        expect(manager.getClientCapabilities()).toBe(null);
      });

      it('should allow re-initialization after reset', () => {
        manager.handleInitialize(validInitParams);
        manager.handleInitialized();
        manager.reset();
        const result = manager.handleInitialize(validInitParams);
        expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
      });
    });
  });

  describe('LifecycleError', () => {
    it('should have correct properties', () => {
      const error = new LifecycleError(-32600, 'Test error', { detail: 'info' });
      expect(error.code).toBe(-32600);
      expect(error.message).toBe('Test error');
      expect(error.data).toEqual({ detail: 'info' });
      expect(error.name).toBe('LifecycleError');
    });

    it('should convert to JSON-RPC error', () => {
      const error = new LifecycleError(-32600, 'Test error', { detail: 'info' });
      const jsonRpcError = error.toJsonRpcError();
      expect(jsonRpcError.code).toBe(-32600);
      expect(jsonRpcError.message).toBe('Test error');
      expect(jsonRpcError.data).toEqual({ detail: 'info' });
    });

    it('should be instance of Error', () => {
      const error = new LifecycleError(-32600, 'Test error');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('Zod Schemas', () => {
    describe('ClientCapabilitiesSchema', () => {
      it('should accept empty capabilities', () => {
        const result = ClientCapabilitiesSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('should accept roots capability', () => {
        const result = ClientCapabilitiesSchema.safeParse({
          roots: { listChanged: true },
        });
        expect(result.success).toBe(true);
      });

      it('should accept sampling capability', () => {
        const result = ClientCapabilitiesSchema.safeParse({
          sampling: { someFeature: true },
        });
        expect(result.success).toBe(true);
      });

      it('should accept experimental capability', () => {
        const result = ClientCapabilitiesSchema.safeParse({
          experimental: { newFeature: { enabled: true } },
        });
        expect(result.success).toBe(true);
      });
    });

    describe('InitializeParamsSchema', () => {
      it('should accept valid params', () => {
        const params = {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'client', version: '1.0.0' },
        };
        const result = InitializeParamsSchema.safeParse(params);
        expect(result.success).toBe(true);
      });

      it('should reject missing protocolVersion', () => {
        const params = {
          capabilities: {},
          clientInfo: { name: 'client', version: '1.0.0' },
        };
        const result = InitializeParamsSchema.safeParse(params);
        expect(result.success).toBe(false);
      });

      it('should reject missing clientInfo', () => {
        const params = {
          protocolVersion: '2025-11-25',
          capabilities: {},
        };
        const result = InitializeParamsSchema.safeParse(params);
        expect(result.success).toBe(false);
      });

      it('should reject missing capabilities', () => {
        const params = {
          protocolVersion: '2025-11-25',
          clientInfo: { name: 'client', version: '1.0.0' },
        };
        const result = InitializeParamsSchema.safeParse(params);
        expect(result.success).toBe(false);
      });

      it('should reject incomplete clientInfo', () => {
        const params = {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'client' },
        };
        const result = InitializeParamsSchema.safeParse(params);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Full lifecycle flow', () => {
    it('should complete full initialization sequence', () => {
      const manager = new LifecycleManager({
        name: 'test-server',
        version: '1.0.0',
        description: 'A test server',
        capabilities: {
          tools: { listChanged: true },
        },
        instructions: 'Use me for testing',
      });

      // Initial state
      expect(manager.getState()).toBe('uninitialized');
      expect(manager.isOperational()).toBe(false);

      // Send initialize request
      const initRequest = createRequest(1, 'initialize');
      expect(manager.checkPreInitialization(initRequest)).toBe(null);

      const result = manager.handleInitialize({
        protocolVersion: '2025-11-25',
        capabilities: { roots: { listChanged: true } },
        clientInfo: { name: 'test-client', version: '2.0.0' },
      });

      expect(result.protocolVersion).toBe('2025-11-25');
      expect(result.serverInfo.name).toBe('test-server');
      expect(result.serverInfo.description).toBe('A test server');
      expect(result.capabilities.tools?.listChanged).toBe(true);
      expect(result.instructions).toBe('Use me for testing');

      // State after initialize
      expect(manager.getState()).toBe('initializing');
      expect(manager.isOperational()).toBe(false);

      // Other requests should be rejected
      const toolsRequest = createRequest(2, 'tools/list');
      expect(manager.checkPreInitialization(toolsRequest)).not.toBe(null);

      // Send initialized notification
      const initializedNotification = createNotification('notifications/initialized');
      expect(manager.checkPreInitialization(initializedNotification)).toBe(null);
      manager.handleInitialized();

      // State after initialized
      expect(manager.getState()).toBe('ready');
      expect(manager.isOperational()).toBe(true);

      // Now requests are allowed
      expect(manager.checkPreInitialization(toolsRequest)).toBe(null);

      // Shutdown
      expect(manager.initiateShutdown()).toBe(true);
      expect(manager.getState()).toBe('shutting_down');
      expect(manager.isOperational()).toBe(false);

      // Requests rejected during shutdown
      expect(manager.checkPreInitialization(toolsRequest)).not.toBe(null);
    });
  });
});
