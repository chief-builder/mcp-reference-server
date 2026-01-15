import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Extension,
  ExtensionCapability,
  ExtensionRegistry,
  ExtensionError,
  ExtensionNameSchema,
  validateExtensionName,
  isValidExtensionName,
  parseExtensionName,
  negotiateExtensions,
  buildExperimentalCapabilities,
  createDefaultRegistry,
  ExtensionFramework,
} from '../../../src/extensions/framework.js';
import {
  createOAuthM2MExtension,
  OAUTH_M2M_EXTENSION_NAME,
} from '../../../src/extensions/oauth-m2m.js';

describe('Extension Framework', () => {
  describe('Extension Name Validation', () => {
    describe('isValidExtensionName', () => {
      it('should accept valid namespace/name format', () => {
        expect(isValidExtensionName('anthropic/oauth-m2m')).toBe(true);
        expect(isValidExtensionName('myorg/my-extension')).toBe(true);
        expect(isValidExtensionName('org123/ext456')).toBe(true);
        expect(isValidExtensionName('a/b')).toBe(true);
      });

      it('should reject names without namespace', () => {
        expect(isValidExtensionName('oauth-m2m')).toBe(false);
        expect(isValidExtensionName('extension')).toBe(false);
      });

      it('should reject names with multiple slashes', () => {
        expect(isValidExtensionName('anthropic/oauth/m2m')).toBe(false);
        expect(isValidExtensionName('a/b/c')).toBe(false);
      });

      it('should reject names with uppercase letters', () => {
        expect(isValidExtensionName('Anthropic/oauth-m2m')).toBe(false);
        expect(isValidExtensionName('anthropic/OAuth-M2M')).toBe(false);
      });

      it('should reject names with invalid characters', () => {
        expect(isValidExtensionName('anthropic/oauth_m2m')).toBe(false);
        expect(isValidExtensionName('anthropic/oauth.m2m')).toBe(false);
        expect(isValidExtensionName('anthropic/oauth m2m')).toBe(false);
      });

      it('should reject empty strings', () => {
        expect(isValidExtensionName('')).toBe(false);
        expect(isValidExtensionName('/')).toBe(false);
      });
    });

    describe('validateExtensionName', () => {
      it('should return true for valid names', () => {
        expect(validateExtensionName('anthropic/oauth-m2m')).toBe(true);
      });

      it('should throw ExtensionError for invalid names', () => {
        expect(() => validateExtensionName('invalid')).toThrow(ExtensionError);
        expect(() => validateExtensionName('invalid')).toThrow(/Invalid extension name/);
      });
    });

    describe('parseExtensionName', () => {
      it('should parse valid extension names', () => {
        const result = parseExtensionName('anthropic/oauth-m2m');
        expect(result.namespace).toBe('anthropic');
        expect(result.extension).toBe('oauth-m2m');
      });

      it('should throw for invalid names', () => {
        expect(() => parseExtensionName('invalid')).toThrow(ExtensionError);
      });
    });

    describe('ExtensionNameSchema', () => {
      it('should validate extension names with Zod', () => {
        const result = ExtensionNameSchema.safeParse('anthropic/oauth-m2m');
        expect(result.success).toBe(true);
      });

      it('should reject invalid names with Zod', () => {
        const result = ExtensionNameSchema.safeParse('invalid');
        expect(result.success).toBe(false);
      });
    });
  });

  describe('ExtensionRegistry', () => {
    let registry: ExtensionRegistry;
    const testExtension: Extension = {
      name: 'test/extension',
      description: 'Test extension',
      version: '1.0.0',
      settings: { enabled: true },
    };

    beforeEach(() => {
      registry = new ExtensionRegistry();
    });

    describe('registerExtension', () => {
      it('should register a valid extension', () => {
        registry.registerExtension(testExtension);
        expect(registry.hasExtension('test/extension')).toBe(true);
      });

      it('should throw for invalid extension name', () => {
        const invalid: Extension = { name: 'invalid', version: '1.0.0' };
        expect(() => registry.registerExtension(invalid)).toThrow(ExtensionError);
      });

      it('should throw if extension already registered', () => {
        registry.registerExtension(testExtension);
        expect(() => registry.registerExtension(testExtension)).toThrow(ExtensionError);
        expect(() => registry.registerExtension(testExtension)).toThrow(/already registered/);
      });
    });

    describe('unregisterExtension', () => {
      it('should unregister an existing extension', () => {
        registry.registerExtension(testExtension);
        registry.unregisterExtension('test/extension');
        expect(registry.hasExtension('test/extension')).toBe(false);
      });

      it('should throw if extension not registered', () => {
        expect(() => registry.unregisterExtension('test/extension')).toThrow(ExtensionError);
        expect(() => registry.unregisterExtension('test/extension')).toThrow(/not registered/);
      });

      it('should also remove from enabled extensions', () => {
        registry.registerExtension(testExtension);
        registry.enableExtension('test/extension', { name: 'test/extension' });
        expect(registry.isEnabled('test/extension')).toBe(true);

        registry.unregisterExtension('test/extension');
        expect(registry.isEnabled('test/extension')).toBe(false);
      });
    });

    describe('getExtension', () => {
      it('should return registered extension', () => {
        registry.registerExtension(testExtension);
        const ext = registry.getExtension('test/extension');
        expect(ext).toEqual(testExtension);
      });

      it('should return undefined for unregistered extension', () => {
        expect(registry.getExtension('test/extension')).toBeUndefined();
      });
    });

    describe('listExtensions', () => {
      it('should return empty array when no extensions', () => {
        expect(registry.listExtensions()).toEqual([]);
      });

      it('should return all registered extensions', () => {
        const ext1: Extension = { name: 'org/ext1', version: '1.0.0' };
        const ext2: Extension = { name: 'org/ext2', version: '2.0.0' };
        registry.registerExtension(ext1);
        registry.registerExtension(ext2);

        const list = registry.listExtensions();
        expect(list).toHaveLength(2);
        expect(list).toContainEqual(ext1);
        expect(list).toContainEqual(ext2);
      });
    });

    describe('getSupportedExtensions', () => {
      it('should return empty object when no extensions', () => {
        expect(registry.getSupportedExtensions()).toEqual({});
      });

      it('should return capability info for all extensions', () => {
        registry.registerExtension(testExtension);
        const supported = registry.getSupportedExtensions();

        expect(supported['test/extension']).toEqual({
          name: 'test/extension',
          settings: { enabled: true },
        });
      });
    });

    describe('enabled extensions', () => {
      it('should track enabled extensions', () => {
        registry.registerExtension(testExtension);
        expect(registry.isEnabled('test/extension')).toBe(false);

        registry.enableExtension('test/extension', { name: 'test/extension' });
        expect(registry.isEnabled('test/extension')).toBe(true);
      });

      it('should return enabled extensions map', () => {
        registry.registerExtension(testExtension);
        const capability: ExtensionCapability = {
          name: 'test/extension',
          settings: { foo: 'bar' },
        };
        registry.enableExtension('test/extension', capability);

        const enabled = registry.getEnabledExtensions();
        expect(enabled.get('test/extension')).toEqual(capability);
      });

      it('should clear enabled extensions', () => {
        registry.registerExtension(testExtension);
        registry.enableExtension('test/extension', { name: 'test/extension' });
        expect(registry.isEnabled('test/extension')).toBe(true);

        registry.clearEnabledExtensions();
        expect(registry.isEnabled('test/extension')).toBe(false);
      });
    });

    describe('shutdown', () => {
      it('should call onShutdown for enabled extensions', async () => {
        const onShutdown = vi.fn().mockResolvedValue(undefined);
        const ext: Extension = {
          name: 'test/ext',
          version: '1.0.0',
          onShutdown,
        };

        registry.registerExtension(ext);
        registry.enableExtension('test/ext', { name: 'test/ext' });

        await registry.shutdown();

        expect(onShutdown).toHaveBeenCalled();
        expect(registry.isEnabled('test/ext')).toBe(false);
      });

      it('should handle shutdown errors gracefully', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const onShutdown = vi.fn().mockRejectedValue(new Error('shutdown failed'));
        const ext: Extension = {
          name: 'test/ext',
          version: '1.0.0',
          onShutdown,
        };

        registry.registerExtension(ext);
        registry.enableExtension('test/ext', { name: 'test/ext' });

        await expect(registry.shutdown()).resolves.not.toThrow();
        expect(consoleError).toHaveBeenCalled();

        consoleError.mockRestore();
      });

      it('should clear enabled extensions after shutdown', async () => {
        registry.registerExtension(testExtension);
        registry.enableExtension('test/extension', { name: 'test/extension' });

        await registry.shutdown();

        expect(registry.getEnabledExtensions().size).toBe(0);
      });
    });
  });

  describe('Extension Negotiation', () => {
    let registry: ExtensionRegistry;

    beforeEach(() => {
      registry = new ExtensionRegistry();
    });

    describe('negotiateExtensions', () => {
      it('should return empty result when client has no experimental capabilities', async () => {
        registry.registerExtension({ name: 'test/ext', version: '1.0.0' });

        const result = await negotiateExtensions(undefined, registry);
        expect(result.enabled).toEqual({});
      });

      it('should enable mutually supported extensions', async () => {
        const ext: Extension = {
          name: 'test/ext',
          version: '1.0.0',
          settings: { feature: true },
        };
        registry.registerExtension(ext);

        const clientExperimental = {
          'test/ext': { clientSetting: 'value' },
        };

        const result = await negotiateExtensions(clientExperimental, registry);

        expect(result.enabled['test/ext']).toBeDefined();
        expect(result.enabled['test/ext']!.name).toBe('test/ext');
        expect(result.enabled['test/ext']!.settings).toEqual({ feature: true });
        expect(registry.isEnabled('test/ext')).toBe(true);
      });

      it('should not enable extensions server does not support', async () => {
        const clientExperimental = {
          'unknown/ext': {},
        };

        const result = await negotiateExtensions(clientExperimental, registry);
        expect(result.enabled).toEqual({});
      });

      it('should skip non-extension experimental capabilities', async () => {
        registry.registerExtension({ name: 'test/ext', version: '1.0.0' });

        const clientExperimental = {
          'test/ext': {},
          'someFeature': true, // Not an extension (no namespace)
        };

        const result = await negotiateExtensions(clientExperimental, registry);

        expect(result.enabled['test/ext']).toBeDefined();
        expect(result.enabled['someFeature']).toBeUndefined();
      });

      it('should call onInitialize with client settings', async () => {
        const onInitialize = vi.fn().mockResolvedValue(undefined);
        const ext: Extension = {
          name: 'test/ext',
          version: '1.0.0',
          onInitialize,
        };
        registry.registerExtension(ext);

        const clientSettings = { token: 'abc123' };
        const clientExperimental = {
          'test/ext': clientSettings,
        };

        await negotiateExtensions(clientExperimental, registry);

        expect(onInitialize).toHaveBeenCalledWith(clientSettings);
      });

      it('should skip extension if onInitialize fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const onInitialize = vi.fn().mockRejectedValue(new Error('init failed'));
        const ext: Extension = {
          name: 'test/ext',
          version: '1.0.0',
          onInitialize,
        };
        registry.registerExtension(ext);

        const result = await negotiateExtensions({ 'test/ext': {} }, registry);

        expect(result.enabled['test/ext']).toBeUndefined();
        expect(registry.isEnabled('test/ext')).toBe(false);
        expect(consoleError).toHaveBeenCalled();

        consoleError.mockRestore();
      });

      it('should handle non-object client values', async () => {
        const onInitialize = vi.fn().mockResolvedValue(undefined);
        const ext: Extension = {
          name: 'test/ext',
          version: '1.0.0',
          onInitialize,
        };
        registry.registerExtension(ext);

        // Client sends boolean instead of object
        await negotiateExtensions({ 'test/ext': true }, registry);

        // Should still call with empty object
        expect(onInitialize).toHaveBeenCalledWith({});
      });
    });

    describe('buildExperimentalCapabilities', () => {
      it('should return empty object for empty registry', () => {
        const result = buildExperimentalCapabilities(registry);
        expect(result).toEqual({});
      });

      it('should include all registered extensions', () => {
        registry.registerExtension({
          name: 'test/ext1',
          version: '1.0.0',
          settings: { a: 1 },
        });
        registry.registerExtension({
          name: 'test/ext2',
          version: '2.0.0',
          settings: { b: 2 },
        });

        const result = buildExperimentalCapabilities(registry);

        expect(result['test/ext1']).toEqual({ a: 1 });
        expect(result['test/ext2']).toEqual({ b: 2 });
      });

      it('should use empty object for extensions without settings', () => {
        registry.registerExtension({ name: 'test/ext', version: '1.0.0' });

        const result = buildExperimentalCapabilities(registry);
        expect(result['test/ext']).toEqual({});
      });

      it('should merge additional experimental capabilities', () => {
        registry.registerExtension({
          name: 'test/ext',
          version: '1.0.0',
          settings: { ext: true },
        });

        const result = buildExperimentalCapabilities(registry, {
          customFeature: { enabled: true },
        });

        expect(result['test/ext']).toEqual({ ext: true });
        expect(result['customFeature']).toEqual({ enabled: true });
      });

      it('should not override extensions with additional capabilities', () => {
        registry.registerExtension({
          name: 'test/ext',
          version: '1.0.0',
          settings: { original: true },
        });

        const result = buildExperimentalCapabilities(registry, {
          'test/ext': { override: true },
        });

        // Extension settings should not be overridden
        expect(result['test/ext']).toEqual({ original: true });
      });
    });
  });

  describe('Built-in Extensions', () => {
    describe('createOAuthM2MExtension from oauth-m2m.ts', () => {
      const mockConfig = {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'client-123',
        clientSecret: 'secret-456',
      };

      it('should create extension with correct name', () => {
        const ext = createOAuthM2MExtension(mockConfig);
        expect(ext.name).toBe(OAUTH_M2M_EXTENSION_NAME);
        expect(ext.name).toBe('anthropic/oauth-m2m');
      });

      it('should have description and version', () => {
        const ext = createOAuthM2MExtension(mockConfig);
        expect(ext.description).toBeDefined();
        expect(ext.version).toBe('1.0.0');
      });

      it('should include settings from config', () => {
        const ext = createOAuthM2MExtension(mockConfig);
        expect(ext.settings).toEqual({
          grantTypes: ['client_credentials'],
          tokenEndpoint: 'https://auth.example.com/token',
        });
      });

      it('should have lifecycle hooks', () => {
        const ext = createOAuthM2MExtension(mockConfig);
        expect(ext.onInitialize).toBeDefined();
        expect(ext.onShutdown).toBeDefined();
      });
    });

    describe('createDefaultRegistry', () => {
      it('should create registry with oauth-m2m extension', () => {
        const registry = createDefaultRegistry();
        expect(registry.hasExtension('anthropic/oauth-m2m')).toBe(true);
      });

      it('should include oauth-m2m in supported extensions', () => {
        const registry = createDefaultRegistry();
        const supported = registry.getSupportedExtensions();
        expect(supported['anthropic/oauth-m2m']).toBeDefined();
      });
    });
  });

  describe('Legacy ExtensionFramework (backwards compatibility)', () => {
    let framework: ExtensionFramework;

    beforeEach(() => {
      framework = new ExtensionFramework();
    });

    it('should register extensions with new namespace format', () => {
      const ext: Extension = {
        name: 'test/ext',
        version: '1.0.0',
      };
      framework.register(ext);
      // No error means success
    });

    it('should convert legacy names to namespace format', () => {
      const ext: Extension = {
        name: 'oauth-m2m',
        version: '1.0.0',
      };
      framework.register(ext);
      // Should be registered as legacy/oauth-m2m
    });

    it('should negotiate and return enabled extensions', async () => {
      const ext: Extension = {
        name: 'legacy/test',
        version: '1.0.0',
      };
      framework.register(ext);

      const result = await framework.negotiate({
        extensions: [{ name: 'test', version: '1.0.0' }],
      });

      expect(result.enabled).toHaveLength(1);
      expect(result.enabled[0]!.name).toBe('test');
    });

    it('should check if extension is enabled', async () => {
      const ext: Extension = {
        name: 'legacy/test',
        version: '1.0.0',
      };
      framework.register(ext);

      expect(framework.isEnabled('test')).toBe(false);

      await framework.negotiate({
        extensions: [{ name: 'test', version: '1.0.0' }],
      });

      expect(framework.isEnabled('test')).toBe(true);
    });

    it('should shutdown gracefully', async () => {
      const onShutdown = vi.fn().mockResolvedValue(undefined);
      const ext: Extension = {
        name: 'legacy/test',
        version: '1.0.0',
        onShutdown,
      };
      framework.register(ext);

      await framework.negotiate({
        extensions: [{ name: 'test', version: '1.0.0' }],
      });

      await framework.shutdown();

      expect(onShutdown).toHaveBeenCalled();
    });
  });

  describe('ExtensionError', () => {
    it('should have correct name', () => {
      const error = new ExtensionError('test error');
      expect(error.name).toBe('ExtensionError');
    });

    it('should preserve message', () => {
      const error = new ExtensionError('test message');
      expect(error.message).toBe('test message');
    });

    it('should be instanceof Error', () => {
      const error = new ExtensionError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
