import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ConfigSchema,
  Config,
  loadConfig,
  getConfig,
  reloadConfig,
  resetConfig,
  setConfig,
} from '../../src/config.js';

describe('Config', () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset config singleton before each test
    resetConfig();
    // Clear all MCP-related env vars
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('MCP_') || key.startsWith('OTEL_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
    resetConfig();
  });

  describe('ConfigSchema', () => {
    it('should provide default values when no input given', () => {
      const config = ConfigSchema.parse({});
      expect(config.port).toBe(3000);
      expect(config.host).toBe('0.0.0.0');
      expect(config.transport).toBe('both');
      expect(config.statelessMode).toBe(false);
      expect(config.pageSize).toBe(50);
      expect(config.requestTimeoutMs).toBe(60000);
      expect(config.shutdownTimeoutMs).toBe(30000);
      expect(config.progressIntervalMs).toBe(100);
      expect(config.debug).toBe(false);
      expect(config.logLevel).toBe('info');
      expect(config.auth0).toEqual({});
      expect(config.m2mClientSecret).toBeUndefined();
      expect(config.otelEndpoint).toBeUndefined();
    });

    it('should accept valid port numbers', () => {
      expect(ConfigSchema.parse({ port: 1 }).port).toBe(1);
      expect(ConfigSchema.parse({ port: 3000 }).port).toBe(3000);
      expect(ConfigSchema.parse({ port: 65535 }).port).toBe(65535);
    });

    it('should reject invalid port numbers', () => {
      expect(() => ConfigSchema.parse({ port: 0 })).toThrow();
      expect(() => ConfigSchema.parse({ port: -1 })).toThrow();
      expect(() => ConfigSchema.parse({ port: 65536 })).toThrow();
      expect(() => ConfigSchema.parse({ port: 1.5 })).toThrow();
    });

    it('should accept valid transport values', () => {
      expect(ConfigSchema.parse({ transport: 'stdio' }).transport).toBe('stdio');
      expect(ConfigSchema.parse({ transport: 'http' }).transport).toBe('http');
      expect(ConfigSchema.parse({ transport: 'both' }).transport).toBe('both');
    });

    it('should reject invalid transport values', () => {
      expect(() => ConfigSchema.parse({ transport: 'invalid' })).toThrow();
      expect(() => ConfigSchema.parse({ transport: '' })).toThrow();
    });

    it('should accept valid page sizes', () => {
      expect(ConfigSchema.parse({ pageSize: 1 }).pageSize).toBe(1);
      expect(ConfigSchema.parse({ pageSize: 50 }).pageSize).toBe(50);
      expect(ConfigSchema.parse({ pageSize: 200 }).pageSize).toBe(200);
    });

    it('should reject invalid page sizes', () => {
      expect(() => ConfigSchema.parse({ pageSize: 0 })).toThrow();
      expect(() => ConfigSchema.parse({ pageSize: -1 })).toThrow();
      expect(() => ConfigSchema.parse({ pageSize: 201 })).toThrow();
    });

    it('should accept valid log levels', () => {
      const levels = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];
      levels.forEach((level) => {
        expect(ConfigSchema.parse({ logLevel: level }).logLevel).toBe(level);
      });
    });

    it('should reject invalid log levels', () => {
      expect(() => ConfigSchema.parse({ logLevel: 'invalid' })).toThrow();
      expect(() => ConfigSchema.parse({ logLevel: 'warn' })).toThrow();
    });

    it('should accept auth0 configuration', () => {
      const config = ConfigSchema.parse({
        auth0: {
          domain: 'example.auth0.com',
          audience: 'https://api.example.com',
          clientId: 'abc123',
        },
      });
      expect(config.auth0.domain).toBe('example.auth0.com');
      expect(config.auth0.audience).toBe('https://api.example.com');
      expect(config.auth0.clientId).toBe('abc123');
    });

    it('should accept partial auth0 configuration', () => {
      const config = ConfigSchema.parse({
        auth0: {
          domain: 'example.auth0.com',
        },
      });
      expect(config.auth0.domain).toBe('example.auth0.com');
      expect(config.auth0.audience).toBeUndefined();
      expect(config.auth0.clientId).toBeUndefined();
    });

    it('should accept timeout values including zero', () => {
      const config = ConfigSchema.parse({
        requestTimeoutMs: 0,
        shutdownTimeoutMs: 0,
        progressIntervalMs: 0,
      });
      expect(config.requestTimeoutMs).toBe(0);
      expect(config.shutdownTimeoutMs).toBe(0);
      expect(config.progressIntervalMs).toBe(0);
    });

    it('should reject negative timeout values', () => {
      expect(() => ConfigSchema.parse({ requestTimeoutMs: -1 })).toThrow();
      expect(() => ConfigSchema.parse({ shutdownTimeoutMs: -1 })).toThrow();
      expect(() => ConfigSchema.parse({ progressIntervalMs: -1 })).toThrow();
    });
  });

  describe('loadConfig', () => {
    it('should load defaults when no env vars set', () => {
      const config = loadConfig();
      expect(config.port).toBe(3000);
      expect(config.host).toBe('0.0.0.0');
      expect(config.transport).toBe('both');
    });

    it('should load port from MCP_PORT', () => {
      process.env['MCP_PORT'] = '8080';
      const config = loadConfig();
      expect(config.port).toBe(8080);
    });

    it('should load host from MCP_HOST', () => {
      process.env['MCP_HOST'] = '127.0.0.1';
      const config = loadConfig();
      expect(config.host).toBe('127.0.0.1');
    });

    it('should load transport from MCP_TRANSPORT', () => {
      process.env['MCP_TRANSPORT'] = 'stdio';
      const config = loadConfig();
      expect(config.transport).toBe('stdio');
    });

    it('should load statelessMode from MCP_STATELESS_MODE', () => {
      process.env['MCP_STATELESS_MODE'] = 'true';
      const config = loadConfig();
      expect(config.statelessMode).toBe(true);
    });

    it('should parse MCP_STATELESS_MODE with "1"', () => {
      process.env['MCP_STATELESS_MODE'] = '1';
      const config = loadConfig();
      expect(config.statelessMode).toBe(true);
    });

    it('should parse MCP_STATELESS_MODE case-insensitively', () => {
      process.env['MCP_STATELESS_MODE'] = 'TRUE';
      const config = loadConfig();
      expect(config.statelessMode).toBe(true);
    });

    it('should load pageSize from MCP_PAGE_SIZE', () => {
      process.env['MCP_PAGE_SIZE'] = '100';
      const config = loadConfig();
      expect(config.pageSize).toBe(100);
    });

    it('should load requestTimeoutMs from MCP_REQUEST_TIMEOUT_MS', () => {
      process.env['MCP_REQUEST_TIMEOUT_MS'] = '30000';
      const config = loadConfig();
      expect(config.requestTimeoutMs).toBe(30000);
    });

    it('should load shutdownTimeoutMs from MCP_SHUTDOWN_TIMEOUT_MS', () => {
      process.env['MCP_SHUTDOWN_TIMEOUT_MS'] = '15000';
      const config = loadConfig();
      expect(config.shutdownTimeoutMs).toBe(15000);
    });

    it('should load progressIntervalMs from MCP_PROGRESS_INTERVAL_MS', () => {
      process.env['MCP_PROGRESS_INTERVAL_MS'] = '200';
      const config = loadConfig();
      expect(config.progressIntervalMs).toBe(200);
    });

    it('should load debug from MCP_DEBUG', () => {
      process.env['MCP_DEBUG'] = 'true';
      const config = loadConfig();
      expect(config.debug).toBe(true);
    });

    it('should load logLevel from MCP_LOG_LEVEL', () => {
      process.env['MCP_LOG_LEVEL'] = 'debug';
      const config = loadConfig();
      expect(config.logLevel).toBe('debug');
    });

    it('should load auth0.domain from MCP_AUTH0_DOMAIN', () => {
      process.env['MCP_AUTH0_DOMAIN'] = 'test.auth0.com';
      const config = loadConfig();
      expect(config.auth0.domain).toBe('test.auth0.com');
    });

    it('should load auth0.audience from MCP_AUTH0_AUDIENCE', () => {
      process.env['MCP_AUTH0_AUDIENCE'] = 'https://api.test.com';
      const config = loadConfig();
      expect(config.auth0.audience).toBe('https://api.test.com');
    });

    it('should load auth0.clientId from MCP_AUTH0_CLIENT_ID', () => {
      process.env['MCP_AUTH0_CLIENT_ID'] = 'client123';
      const config = loadConfig();
      expect(config.auth0.clientId).toBe('client123');
    });

    it('should load m2mClientSecret from MCP_M2M_CLIENT_SECRET', () => {
      process.env['MCP_M2M_CLIENT_SECRET'] = 'secret123';
      const config = loadConfig();
      expect(config.m2mClientSecret).toBe('secret123');
    });

    it('should load otelEndpoint from OTEL_EXPORTER_OTLP_ENDPOINT', () => {
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://localhost:4318';
      const config = loadConfig();
      expect(config.otelEndpoint).toBe('http://localhost:4318');
    });

    it('should throw on invalid port value', () => {
      process.env['MCP_PORT'] = '99999';
      expect(() => loadConfig()).toThrow();
    });

    it('should throw on invalid transport value', () => {
      process.env['MCP_TRANSPORT'] = 'websocket';
      expect(() => loadConfig()).toThrow();
    });

    it('should handle empty string env vars as undefined', () => {
      process.env['MCP_PORT'] = '';
      process.env['MCP_HOST'] = '';
      const config = loadConfig();
      expect(config.port).toBe(3000);
      expect(config.host).toBe('0.0.0.0');
    });

    it('should handle non-numeric port values', () => {
      process.env['MCP_PORT'] = 'abc';
      // parseInt returns NaN for 'abc', which becomes undefined, so default is used
      const config = loadConfig();
      expect(config.port).toBe(3000);
    });

    it('should load config from custom env object', () => {
      const customEnv: NodeJS.ProcessEnv = {
        MCP_PORT: '9000',
        MCP_HOST: 'custom.host.com',
        MCP_TRANSPORT: 'http',
        MCP_DEBUG: 'true',
        MCP_LOG_LEVEL: 'warning',
      };
      const config = loadConfig(customEnv);
      expect(config.port).toBe(9000);
      expect(config.host).toBe('custom.host.com');
      expect(config.transport).toBe('http');
      expect(config.debug).toBe(true);
      expect(config.logLevel).toBe('warning');
    });

    it('should not modify process.env when using custom env object', () => {
      const customEnv: NodeJS.ProcessEnv = {
        MCP_PORT: '7777',
      };
      loadConfig(customEnv);
      expect(process.env['MCP_PORT']).toBeUndefined();
    });

    it('should load all config values from custom env object', () => {
      const customEnv: NodeJS.ProcessEnv = {
        MCP_PORT: '4567',
        MCP_HOST: '192.168.1.1',
        MCP_TRANSPORT: 'stdio',
        MCP_STATELESS_MODE: 'true',
        MCP_PAGE_SIZE: '75',
        MCP_PAGINATION_MAX: '150',
        MCP_REQUEST_TIMEOUT_MS: '45000',
        MCP_SHUTDOWN_TIMEOUT_MS: '20000',
        MCP_PROGRESS_INTERVAL_MS: '250',
        MCP_DEBUG: '1',
        MCP_LOG_LEVEL: 'error',
        MCP_AUTH0_DOMAIN: 'custom.auth0.com',
        MCP_AUTH0_AUDIENCE: 'https://custom.api.com',
        MCP_AUTH0_CLIENT_ID: 'custom-client-id',
        MCP_M2M_CLIENT_SECRET: 'custom-secret',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://custom-otel:4318',
      };
      const config = loadConfig(customEnv);
      expect(config.port).toBe(4567);
      expect(config.host).toBe('192.168.1.1');
      expect(config.transport).toBe('stdio');
      expect(config.statelessMode).toBe(true);
      expect(config.pageSize).toBe(75);
      expect(config.maxPageSize).toBe(150);
      expect(config.requestTimeoutMs).toBe(45000);
      expect(config.shutdownTimeoutMs).toBe(20000);
      expect(config.progressIntervalMs).toBe(250);
      expect(config.debug).toBe(true);
      expect(config.logLevel).toBe('error');
      expect(config.auth0.domain).toBe('custom.auth0.com');
      expect(config.auth0.audience).toBe('https://custom.api.com');
      expect(config.auth0.clientId).toBe('custom-client-id');
      expect(config.m2mClientSecret).toBe('custom-secret');
      expect(config.otelEndpoint).toBe('http://custom-otel:4318');
    });

    it('should use defaults when custom env is empty', () => {
      const customEnv: NodeJS.ProcessEnv = {};
      const config = loadConfig(customEnv);
      expect(config.port).toBe(3000);
      expect(config.host).toBe('0.0.0.0');
      expect(config.transport).toBe('both');
      expect(config.debug).toBe(false);
      expect(config.logLevel).toBe('info');
    });
  });

  describe('getConfig', () => {
    it('should return singleton config', () => {
      const config1 = getConfig();
      const config2 = getConfig();
      expect(config1).toBe(config2);
    });

    it('should load config on first call', () => {
      process.env['MCP_PORT'] = '4000';
      const config = getConfig();
      expect(config.port).toBe(4000);
    });

    it('should not reload config on subsequent calls', () => {
      process.env['MCP_PORT'] = '4000';
      const config1 = getConfig();
      process.env['MCP_PORT'] = '5000';
      const config2 = getConfig();
      expect(config2.port).toBe(4000);
    });
  });

  describe('reloadConfig', () => {
    it('should reload config from environment', () => {
      process.env['MCP_PORT'] = '4000';
      const config1 = getConfig();
      expect(config1.port).toBe(4000);

      process.env['MCP_PORT'] = '5000';
      const config2 = reloadConfig();
      expect(config2.port).toBe(5000);
    });

    it('should update singleton', () => {
      process.env['MCP_PORT'] = '4000';
      getConfig();
      process.env['MCP_PORT'] = '5000';
      reloadConfig();
      expect(getConfig().port).toBe(5000);
    });
  });

  describe('resetConfig', () => {
    it('should clear singleton', () => {
      process.env['MCP_PORT'] = '4000';
      getConfig();
      resetConfig();
      process.env['MCP_PORT'] = '5000';
      expect(getConfig().port).toBe(5000);
    });
  });

  describe('setConfig', () => {
    it('should set config directly', () => {
      const customConfig: Config = {
        port: 9999,
        host: 'injected.host',
        transport: 'stdio',
        statelessMode: true,
        pageSize: 100,
        maxPageSize: 500,
        requestTimeoutMs: 10000,
        shutdownTimeoutMs: 5000,
        progressIntervalMs: 50,
        debug: true,
        logLevel: 'debug',
        auth0: {
          domain: 'injected.auth0.com',
          audience: 'https://injected.api.com',
          clientId: 'injected-client',
        },
        m2mClientSecret: 'injected-secret',
        otelEndpoint: 'http://injected-otel:4318',
      };
      setConfig(customConfig);
      const retrieved = getConfig();
      expect(retrieved).toBe(customConfig);
      expect(retrieved.port).toBe(9999);
      expect(retrieved.host).toBe('injected.host');
      expect(retrieved.transport).toBe('stdio');
      expect(retrieved.statelessMode).toBe(true);
      expect(retrieved.debug).toBe(true);
      expect(retrieved.logLevel).toBe('debug');
    });

    it('should override previously loaded config', () => {
      process.env['MCP_PORT'] = '4000';
      const loaded = getConfig();
      expect(loaded.port).toBe(4000);

      const injected: Config = {
        ...loaded,
        port: 8888,
        host: 'overridden.host',
      };
      setConfig(injected);
      expect(getConfig().port).toBe(8888);
      expect(getConfig().host).toBe('overridden.host');
    });

    it('should not be affected by process.env changes after setConfig', () => {
      const customConfig: Config = {
        port: 1234,
        host: 'set-config.host',
        transport: 'http',
        statelessMode: false,
        pageSize: 50,
        maxPageSize: 200,
        requestTimeoutMs: 60000,
        shutdownTimeoutMs: 30000,
        progressIntervalMs: 100,
        debug: false,
        logLevel: 'info',
        auth0: {},
        m2mClientSecret: undefined,
        otelEndpoint: undefined,
      };
      setConfig(customConfig);
      process.env['MCP_PORT'] = '5555';
      process.env['MCP_HOST'] = 'env.host';
      // getConfig should return the injected config, not reload from env
      expect(getConfig().port).toBe(1234);
      expect(getConfig().host).toBe('set-config.host');
    });
  });

  describe('Type inference', () => {
    it('should infer correct types from schema', () => {
      const config: Config = ConfigSchema.parse({});
      // Type assertions - these would fail at compile time if types are wrong
      const _port: number = config.port;
      const _host: string = config.host;
      const _transport: 'stdio' | 'http' | 'both' = config.transport;
      const _statelessMode: boolean = config.statelessMode;
      const _pageSize: number = config.pageSize;
      const _requestTimeoutMs: number = config.requestTimeoutMs;
      const _shutdownTimeoutMs: number = config.shutdownTimeoutMs;
      const _progressIntervalMs: number = config.progressIntervalMs;
      const _debug: boolean = config.debug;
      const _logLevel: string = config.logLevel;
      const _auth0Domain: string | undefined = config.auth0.domain;
      const _m2mClientSecret: string | undefined = config.m2mClientSecret;
      const _otelEndpoint: string | undefined = config.otelEndpoint;
      // Suppress unused warnings
      void [_port, _host, _transport, _statelessMode, _pageSize, _requestTimeoutMs, _shutdownTimeoutMs, _progressIntervalMs, _debug, _logLevel, _auth0Domain, _m2mClientSecret, _otelEndpoint];
      expect(true).toBe(true);
    });
  });
});
