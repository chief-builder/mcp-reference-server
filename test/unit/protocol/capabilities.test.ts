import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapabilityManager,
  CapabilityError,
  NegotiatedCapabilities,
  DEFAULT_SERVER_INFO,
  getDefaultServerCapabilities,
  negotiateCapabilities,
  hasCapabilityAtPath,
  getCapabilityAtPath,
  getMethodCapabilityMapping,
  getNotificationCapabilityMapping,
  hasCapability,
  requireCapability,
} from '../../../src/protocol/capabilities.js';
import {
  LifecycleManager,
  ServerConfig,
  ServerCapabilities,
  ClientCapabilities,
  InitializeParams,
} from '../../../src/protocol/lifecycle.js';
import { JsonRpcErrorCodes } from '../../../src/protocol/jsonrpc.js';

describe('Capability Negotiation', () => {
  describe('Constants', () => {
    it('should have correct default server info', () => {
      expect(DEFAULT_SERVER_INFO.name).toBe('mcp-reference-server');
      expect(DEFAULT_SERVER_INFO.version).toBe('1.0.0');
      expect(DEFAULT_SERVER_INFO.description).toBe('MCP 2025-11-25 Reference Implementation');
    });
  });

  describe('getDefaultServerCapabilities', () => {
    it('should return expected default capabilities', () => {
      const caps = getDefaultServerCapabilities();
      expect(caps.tools?.listChanged).toBe(true);
      expect(caps.logging).toEqual({});
      expect(caps.completions).toEqual({});
      expect(caps.experimental?.['oauth-m2m']).toEqual({});
    });

    it('should return a new object each time', () => {
      const caps1 = getDefaultServerCapabilities();
      const caps2 = getDefaultServerCapabilities();
      expect(caps1).not.toBe(caps2);
      expect(caps1).toEqual(caps2);
    });
  });

  describe('negotiateCapabilities', () => {
    it('should return both client and server capabilities', () => {
      const clientCaps: ClientCapabilities = {
        roots: { listChanged: true },
      };
      const serverCaps: ServerCapabilities = {
        tools: { listChanged: true },
      };

      const negotiated = negotiateCapabilities(clientCaps, serverCaps);
      expect(negotiated.client).toEqual(clientCaps);
      expect(negotiated.server).toEqual(serverCaps);
    });

    it('should work with empty capabilities', () => {
      const negotiated = negotiateCapabilities({}, {});
      expect(negotiated.client).toEqual({});
      expect(negotiated.server).toEqual({});
    });
  });

  describe('hasCapabilityAtPath', () => {
    it('should find top-level capabilities', () => {
      const caps: ServerCapabilities = {
        tools: { listChanged: true },
        logging: {},
      };
      expect(hasCapabilityAtPath(caps, 'tools')).toBe(true);
      expect(hasCapabilityAtPath(caps, 'logging')).toBe(true);
      expect(hasCapabilityAtPath(caps, 'resources')).toBe(false);
    });

    it('should find nested capabilities with dot notation', () => {
      const caps: ServerCapabilities = {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: false },
      };
      expect(hasCapabilityAtPath(caps, 'tools.listChanged')).toBe(true);
      expect(hasCapabilityAtPath(caps, 'resources.subscribe')).toBe(true);
      expect(hasCapabilityAtPath(caps, 'resources.listChanged')).toBe(false);
    });

    it('should handle experimental capabilities', () => {
      const caps: ServerCapabilities = {
        experimental: {
          'oauth-m2m': {},
          'feature-x': { enabled: true },
        },
      };
      expect(hasCapabilityAtPath(caps, 'experimental.oauth-m2m')).toBe(true);
      expect(hasCapabilityAtPath(caps, 'experimental.feature-x')).toBe(true);
      expect(hasCapabilityAtPath(caps, 'experimental.feature-y')).toBe(false);
    });

    it('should return false for undefined paths', () => {
      const caps: ServerCapabilities = { tools: { listChanged: true } };
      expect(hasCapabilityAtPath(caps, 'prompts')).toBe(false);
      expect(hasCapabilityAtPath(caps, 'prompts.listChanged')).toBe(false);
      expect(hasCapabilityAtPath(caps, 'tools.subscribe')).toBe(false);
    });

    it('should return false for boolean false values', () => {
      const caps: ServerCapabilities = {
        resources: { subscribe: false },
      };
      expect(hasCapabilityAtPath(caps, 'resources.subscribe')).toBe(false);
    });

    it('should return true for empty object capabilities', () => {
      const caps: ServerCapabilities = {
        logging: {},
      };
      expect(hasCapabilityAtPath(caps, 'logging')).toBe(true);
    });

    it('should work with client capabilities', () => {
      const clientCaps: ClientCapabilities = {
        roots: { listChanged: true },
        sampling: { enabled: true },
      };
      expect(hasCapabilityAtPath(clientCaps, 'roots')).toBe(true);
      expect(hasCapabilityAtPath(clientCaps, 'roots.listChanged')).toBe(true);
      expect(hasCapabilityAtPath(clientCaps, 'sampling')).toBe(true);
    });
  });

  describe('getCapabilityAtPath', () => {
    it('should return value at path', () => {
      const caps: ServerCapabilities = {
        tools: { listChanged: true },
        logging: {},
      };
      expect(getCapabilityAtPath(caps, 'tools')).toEqual({ listChanged: true });
      expect(getCapabilityAtPath(caps, 'tools.listChanged')).toBe(true);
      expect(getCapabilityAtPath(caps, 'logging')).toEqual({});
    });

    it('should return undefined for missing paths', () => {
      const caps: ServerCapabilities = { tools: { listChanged: true } };
      expect(getCapabilityAtPath(caps, 'prompts')).toBeUndefined();
      expect(getCapabilityAtPath(caps, 'tools.subscribe')).toBeUndefined();
    });
  });

  describe('getMethodCapabilityMapping', () => {
    it('should map tools methods to tools capability', () => {
      const mapping = getMethodCapabilityMapping();
      expect(mapping['tools/list']).toBe('tools');
      expect(mapping['tools/call']).toBe('tools');
    });

    it('should map resources methods correctly', () => {
      const mapping = getMethodCapabilityMapping();
      expect(mapping['resources/list']).toBe('resources');
      expect(mapping['resources/read']).toBe('resources');
      expect(mapping['resources/subscribe']).toBe('resources.subscribe');
      expect(mapping['resources/unsubscribe']).toBe('resources.subscribe');
    });

    it('should map prompts methods to prompts capability', () => {
      const mapping = getMethodCapabilityMapping();
      expect(mapping['prompts/list']).toBe('prompts');
      expect(mapping['prompts/get']).toBe('prompts');
    });

    it('should map logging method', () => {
      const mapping = getMethodCapabilityMapping();
      expect(mapping['logging/setLevel']).toBe('logging');
    });

    it('should map completion method', () => {
      const mapping = getMethodCapabilityMapping();
      expect(mapping['completion/complete']).toBe('completions');
    });
  });

  describe('getNotificationCapabilityMapping', () => {
    it('should map roots listChanged notification', () => {
      const mapping = getNotificationCapabilityMapping();
      expect(mapping['notifications/roots/listChanged']).toBe('roots.listChanged');
    });
  });

  describe('CapabilityError', () => {
    it('should have correct properties', () => {
      const error = new CapabilityError('Missing capability', { cap: 'tools' });
      expect(error.message).toBe('Missing capability');
      expect(error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
      expect(error.data).toEqual({ cap: 'tools' });
      expect(error.name).toBe('CapabilityError');
    });

    it('should be instance of Error', () => {
      const error = new CapabilityError('Test');
      expect(error).toBeInstanceOf(Error);
    });

    it('should convert to JSON-RPC error', () => {
      const error = new CapabilityError('Missing tools', { required: 'tools' });
      const jsonRpcError = error.toJsonRpcError();
      expect(jsonRpcError.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
      expect(jsonRpcError.message).toBe('Missing tools');
      expect(jsonRpcError.data).toEqual({ required: 'tools' });
    });
  });

  describe('CapabilityManager', () => {
    let lifecycleManager: LifecycleManager;
    let capabilityManager: CapabilityManager;

    const serverConfig: ServerConfig = {
      name: 'test-server',
      version: '1.0.0',
    };

    const validInitParams: InitializeParams = {
      protocolVersion: '2025-11-25',
      capabilities: {
        roots: { listChanged: true },
      },
      clientInfo: { name: 'test-client', version: '1.0.0' },
    };

    beforeEach(() => {
      lifecycleManager = new LifecycleManager(serverConfig);
      capabilityManager = new CapabilityManager(lifecycleManager);
    });

    describe('getServerCapabilities', () => {
      it('should return default server capabilities', () => {
        const caps = capabilityManager.getServerCapabilities();
        expect(caps).toEqual(getDefaultServerCapabilities());
      });

      it('should return custom server capabilities if provided', () => {
        const customCaps: ServerCapabilities = {
          tools: { listChanged: false },
          resources: { subscribe: true },
        };
        const manager = new CapabilityManager(lifecycleManager, customCaps);
        expect(manager.getServerCapabilities()).toEqual(customCaps);
      });
    });

    describe('getClientCapabilities', () => {
      it('should return null before initialization', () => {
        expect(capabilityManager.getClientCapabilities()).toBe(null);
      });

      it('should return client capabilities after initialization', () => {
        lifecycleManager.handleInitialize(validInitParams);
        expect(capabilityManager.getClientCapabilities()).toEqual({
          roots: { listChanged: true },
        });
      });
    });

    describe('getNegotiatedCapabilities', () => {
      it('should return null before initialization', () => {
        expect(capabilityManager.getNegotiatedCapabilities()).toBe(null);
      });

      it('should return negotiated capabilities after initialization', () => {
        lifecycleManager.handleInitialize(validInitParams);
        const negotiated = capabilityManager.getNegotiatedCapabilities();
        expect(negotiated).not.toBe(null);
        expect(negotiated?.client).toEqual({ roots: { listChanged: true } });
        expect(negotiated?.server).toEqual(getDefaultServerCapabilities());
      });
    });

    describe('hasClientCapability', () => {
      it('should return false before initialization', () => {
        expect(capabilityManager.hasClientCapability('roots')).toBe(false);
        expect(capabilityManager.hasClientCapability('roots.listChanged')).toBe(false);
      });

      it('should check client capabilities after initialization', () => {
        lifecycleManager.handleInitialize(validInitParams);
        expect(capabilityManager.hasClientCapability('roots')).toBe(true);
        expect(capabilityManager.hasClientCapability('roots.listChanged')).toBe(true);
        expect(capabilityManager.hasClientCapability('sampling')).toBe(false);
      });
    });

    describe('hasServerCapability', () => {
      it('should check server capabilities', () => {
        expect(capabilityManager.hasServerCapability('tools')).toBe(true);
        expect(capabilityManager.hasServerCapability('tools.listChanged')).toBe(true);
        expect(capabilityManager.hasServerCapability('logging')).toBe(true);
        expect(capabilityManager.hasServerCapability('completions')).toBe(true);
        expect(capabilityManager.hasServerCapability('resources')).toBe(false);
      });

      it('should check experimental capabilities', () => {
        expect(capabilityManager.hasServerCapability('experimental')).toBe(true);
        expect(capabilityManager.hasServerCapability('experimental.oauth-m2m')).toBe(true);
        expect(capabilityManager.hasServerCapability('experimental.other')).toBe(false);
      });
    });

    describe('requireClientCapability', () => {
      it('should throw if client not initialized', () => {
        expect(() => capabilityManager.requireClientCapability('roots'))
          .toThrow(CapabilityError);
      });

      it('should throw if client lacks capability', () => {
        lifecycleManager.handleInitialize({
          ...validInitParams,
          capabilities: {},
        });
        expect(() => capabilityManager.requireClientCapability('roots'))
          .toThrow(CapabilityError);
      });

      it('should not throw if client has capability', () => {
        lifecycleManager.handleInitialize(validInitParams);
        expect(() => capabilityManager.requireClientCapability('roots')).not.toThrow();
        expect(() => capabilityManager.requireClientCapability('roots.listChanged')).not.toThrow();
      });

      it('should include capability name in error', () => {
        try {
          capabilityManager.requireClientCapability('roots.listChanged');
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(CapabilityError);
          const error = e as CapabilityError;
          expect(error.message).toContain('roots.listChanged');
          expect(error.data).toEqual({ requiredCapability: 'roots.listChanged' });
        }
      });
    });

    describe('requireServerCapability', () => {
      it('should throw if server lacks capability', () => {
        expect(() => capabilityManager.requireServerCapability('resources'))
          .toThrow(CapabilityError);
      });

      it('should not throw if server has capability', () => {
        expect(() => capabilityManager.requireServerCapability('tools')).not.toThrow();
        expect(() => capabilityManager.requireServerCapability('logging')).not.toThrow();
      });

      it('should include capability name in error', () => {
        try {
          capabilityManager.requireServerCapability('prompts');
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(CapabilityError);
          const error = e as CapabilityError;
          expect(error.message).toContain('prompts');
          expect(error.data).toEqual({ requiredCapability: 'prompts' });
        }
      });
    });

    describe('isMethodAllowed', () => {
      it('should allow methods with satisfied capability requirements', () => {
        expect(capabilityManager.isMethodAllowed('tools/list')).toBe(true);
        expect(capabilityManager.isMethodAllowed('tools/call')).toBe(true);
        expect(capabilityManager.isMethodAllowed('logging/setLevel')).toBe(true);
        expect(capabilityManager.isMethodAllowed('completion/complete')).toBe(true);
      });

      it('should disallow methods with unsatisfied capability requirements', () => {
        expect(capabilityManager.isMethodAllowed('resources/list')).toBe(false);
        expect(capabilityManager.isMethodAllowed('resources/subscribe')).toBe(false);
        expect(capabilityManager.isMethodAllowed('prompts/list')).toBe(false);
      });

      it('should allow methods without capability requirements', () => {
        expect(capabilityManager.isMethodAllowed('initialize')).toBe(true);
        expect(capabilityManager.isMethodAllowed('ping')).toBe(true);
        expect(capabilityManager.isMethodAllowed('custom/method')).toBe(true);
      });
    });

    describe('validateMethodCapability', () => {
      it('should not throw for allowed methods', () => {
        expect(() => capabilityManager.validateMethodCapability('tools/list')).not.toThrow();
        expect(() => capabilityManager.validateMethodCapability('logging/setLevel')).not.toThrow();
        expect(() => capabilityManager.validateMethodCapability('initialize')).not.toThrow();
      });

      it('should throw for disallowed methods', () => {
        expect(() => capabilityManager.validateMethodCapability('resources/list'))
          .toThrow(CapabilityError);
      });

      it('should include method and capability in error', () => {
        try {
          capabilityManager.validateMethodCapability('prompts/get');
          expect.fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(CapabilityError);
          const error = e as CapabilityError;
          expect(error.message).toContain('prompts/get');
          expect(error.message).toContain('prompts');
          expect(error.data).toEqual({
            method: 'prompts/get',
            requiredCapability: 'prompts',
          });
        }
      });
    });

    describe('canSendNotification', () => {
      it('should return false for notifications requiring client capability before init', () => {
        expect(capabilityManager.canSendNotification('notifications/roots/listChanged')).toBe(false);
      });

      it('should return true when client has required capability', () => {
        lifecycleManager.handleInitialize(validInitParams);
        expect(capabilityManager.canSendNotification('notifications/roots/listChanged')).toBe(true);
      });

      it('should return false when client lacks required capability', () => {
        lifecycleManager.handleInitialize({
          ...validInitParams,
          capabilities: { roots: { listChanged: false } },
        });
        expect(capabilityManager.canSendNotification('notifications/roots/listChanged')).toBe(false);
      });

      it('should allow notifications without capability requirements', () => {
        expect(capabilityManager.canSendNotification('notifications/progress')).toBe(true);
        expect(capabilityManager.canSendNotification('notifications/message')).toBe(true);
      });
    });

    describe('validateNotificationCapability', () => {
      it('should throw when cannot send notification', () => {
        expect(() => capabilityManager.validateNotificationCapability('notifications/roots/listChanged'))
          .toThrow(CapabilityError);
      });

      it('should not throw when can send notification', () => {
        lifecycleManager.handleInitialize(validInitParams);
        expect(() => capabilityManager.validateNotificationCapability('notifications/roots/listChanged'))
          .not.toThrow();
      });

      it('should not throw for notifications without requirements', () => {
        expect(() => capabilityManager.validateNotificationCapability('notifications/progress'))
          .not.toThrow();
      });
    });
  });

  describe('Legacy functions', () => {
    describe('hasCapability', () => {
      it('should work like hasCapabilityAtPath', () => {
        const caps: ServerCapabilities = {
          tools: { listChanged: true },
        };
        expect(hasCapability(caps, 'tools')).toBe(true);
        expect(hasCapability(caps, 'tools.listChanged')).toBe(true);
        expect(hasCapability(caps, 'prompts')).toBe(false);
      });
    });

    describe('requireCapability', () => {
      it('should throw CapabilityError when missing', () => {
        const caps: ServerCapabilities = {};
        expect(() => requireCapability(caps, 'tools')).toThrow(CapabilityError);
      });

      it('should not throw when present', () => {
        const caps: ServerCapabilities = { tools: { listChanged: true } };
        expect(() => requireCapability(caps, 'tools')).not.toThrow();
      });
    });
  });

  describe('Integration with LifecycleManager', () => {
    it('should work through full initialization flow', () => {
      const serverCaps: ServerCapabilities = {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        logging: {},
      };

      const lifecycleManager = new LifecycleManager({
        name: 'test-server',
        version: '1.0.0',
        capabilities: serverCaps,
      });

      const capabilityManager = new CapabilityManager(lifecycleManager, serverCaps);

      // Before init - client capabilities unknown
      expect(capabilityManager.getClientCapabilities()).toBe(null);
      expect(capabilityManager.hasClientCapability('roots')).toBe(false);

      // Server capabilities are known
      expect(capabilityManager.hasServerCapability('tools')).toBe(true);
      expect(capabilityManager.hasServerCapability('resources.subscribe')).toBe(true);

      // Initialize with client that supports roots
      lifecycleManager.handleInitialize({
        protocolVersion: '2025-11-25',
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      // Now client capabilities are available
      expect(capabilityManager.hasClientCapability('roots')).toBe(true);
      expect(capabilityManager.hasClientCapability('roots.listChanged')).toBe(true);
      expect(capabilityManager.hasClientCapability('sampling')).toBe(true);

      // Can send roots notification
      expect(capabilityManager.canSendNotification('notifications/roots/listChanged')).toBe(true);

      // Full negotiated capabilities available
      const negotiated = capabilityManager.getNegotiatedCapabilities();
      expect(negotiated).not.toBe(null);
      expect(negotiated?.client.roots?.listChanged).toBe(true);
      expect(negotiated?.server.tools?.listChanged).toBe(true);
    });

    it('should handle reset correctly', () => {
      const lifecycleManager = new LifecycleManager({
        name: 'test-server',
        version: '1.0.0',
      });
      const capabilityManager = new CapabilityManager(lifecycleManager);

      // Initialize
      lifecycleManager.handleInitialize({
        protocolVersion: '2025-11-25',
        capabilities: { roots: { listChanged: true } },
        clientInfo: { name: 'client', version: '1.0.0' },
      });

      expect(capabilityManager.hasClientCapability('roots')).toBe(true);

      // Reset
      lifecycleManager.reset();

      // Client capabilities should be unavailable again
      expect(capabilityManager.getClientCapabilities()).toBe(null);
      expect(capabilityManager.hasClientCapability('roots')).toBe(false);

      // Server capabilities remain
      expect(capabilityManager.hasServerCapability('tools')).toBe(true);
    });
  });
});
