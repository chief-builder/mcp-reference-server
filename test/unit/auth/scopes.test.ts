import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Constants
  MCP_SCOPES,
  TOOL_SCOPE_PREFIX,
  TOOL_SCOPES,
  // Schemas
  ScopeStringSchema,
  ScopeArraySchema,
  ScopeManagerConfigSchema,
  // Error class
  InsufficientScopeError,
  // Utility functions
  parseScopes,
  scopesToString,
  isToolScope,
  getToolNameFromScope,
  buildToolScope,
  // Main class
  ScopeManager,
  // Standalone functions
  createScopeManager,
  checkScopeWithInheritance,
  getAllMcpScopes,
  getAllToolScopes,
} from '../../../src/auth/scopes.js';

// =============================================================================
// Constants Tests
// =============================================================================

describe('Scope Constants', () => {
  describe('MCP_SCOPES', () => {
    it('should define read scope', () => {
      expect(MCP_SCOPES.READ).toBe('mcp:read');
    });

    it('should define write scope', () => {
      expect(MCP_SCOPES.WRITE).toBe('mcp:write');
    });

    it('should define admin scope', () => {
      expect(MCP_SCOPES.ADMIN).toBe('mcp:admin');
    });
  });

  describe('TOOL_SCOPES', () => {
    it('should define calculate scope', () => {
      expect(TOOL_SCOPES.CALCULATE).toBe('mcp:tool:calculate');
    });

    it('should define roll_dice scope', () => {
      expect(TOOL_SCOPES.ROLL_DICE).toBe('mcp:tool:roll_dice');
    });

    it('should define tell_fortune scope', () => {
      expect(TOOL_SCOPES.TELL_FORTUNE).toBe('mcp:tool:tell_fortune');
    });
  });

  describe('TOOL_SCOPE_PREFIX', () => {
    it('should be mcp:tool:', () => {
      expect(TOOL_SCOPE_PREFIX).toBe('mcp:tool:');
    });
  });
});

// =============================================================================
// Schema Tests
// =============================================================================

describe('Scope Zod Schemas', () => {
  describe('ScopeStringSchema', () => {
    it('should accept valid scope string', () => {
      const result = ScopeStringSchema.safeParse('mcp:read');
      expect(result.success).toBe(true);
    });

    it('should reject empty string', () => {
      const result = ScopeStringSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject whitespace-only string', () => {
      const result = ScopeStringSchema.safeParse('   ');
      expect(result.success).toBe(false);
    });
  });

  describe('ScopeArraySchema', () => {
    it('should accept valid scope array', () => {
      const result = ScopeArraySchema.safeParse(['mcp:read', 'mcp:write']);
      expect(result.success).toBe(true);
    });

    it('should accept empty array', () => {
      const result = ScopeArraySchema.safeParse([]);
      expect(result.success).toBe(true);
    });

    it('should reject array with empty strings', () => {
      const result = ScopeArraySchema.safeParse(['mcp:read', '']);
      expect(result.success).toBe(false);
    });
  });

  describe('ScopeManagerConfigSchema', () => {
    it('should accept empty config', () => {
      const result = ScopeManagerConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept valid config', () => {
      const result = ScopeManagerConfigSchema.safeParse({
        resourceMetadataUrl: 'https://api.example.com/.well-known/oauth-protected-resource',
        realm: 'MCP Server',
      });
      expect(result.success).toBe(true);
    });

    it('should validate resourceMetadataUrl as URL', () => {
      const result = ScopeManagerConfigSchema.safeParse({
        resourceMetadataUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should accept custom method scopes', () => {
      const result = ScopeManagerConfigSchema.safeParse({
        customMethodScopes: {
          'custom/method': ['mcp:custom'],
        },
      });
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Scope Utility Functions', () => {
  describe('parseScopes', () => {
    it('should parse space-separated scopes', () => {
      const result = parseScopes('mcp:read mcp:write mcp:admin');
      expect(result).toEqual(['mcp:read', 'mcp:write', 'mcp:admin']);
    });

    it('should handle multiple spaces', () => {
      const result = parseScopes('mcp:read   mcp:write');
      expect(result).toEqual(['mcp:read', 'mcp:write']);
    });

    it('should handle leading/trailing spaces', () => {
      const result = parseScopes('  mcp:read mcp:write  ');
      expect(result).toEqual(['mcp:read', 'mcp:write']);
    });

    it('should return empty array for empty string', () => {
      const result = parseScopes('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only string', () => {
      const result = parseScopes('   ');
      expect(result).toEqual([]);
    });

    it('should handle single scope', () => {
      const result = parseScopes('mcp:read');
      expect(result).toEqual(['mcp:read']);
    });

    it('should handle tab-separated scopes', () => {
      const result = parseScopes('mcp:read\tmcp:write');
      expect(result).toEqual(['mcp:read', 'mcp:write']);
    });
  });

  describe('scopesToString', () => {
    it('should join scopes with spaces', () => {
      const result = scopesToString(['mcp:read', 'mcp:write']);
      expect(result).toBe('mcp:read mcp:write');
    });

    it('should return empty string for empty array', () => {
      const result = scopesToString([]);
      expect(result).toBe('');
    });

    it('should filter out empty strings', () => {
      const result = scopesToString(['mcp:read', '', 'mcp:write']);
      expect(result).toBe('mcp:read mcp:write');
    });
  });

  describe('isToolScope', () => {
    it('should return true for tool scopes', () => {
      expect(isToolScope('mcp:tool:calculate')).toBe(true);
      expect(isToolScope('mcp:tool:custom_tool')).toBe(true);
    });

    it('should return false for non-tool scopes', () => {
      expect(isToolScope('mcp:read')).toBe(false);
      expect(isToolScope('mcp:write')).toBe(false);
      expect(isToolScope('openid')).toBe(false);
    });
  });

  describe('getToolNameFromScope', () => {
    it('should extract tool name from tool scope', () => {
      expect(getToolNameFromScope('mcp:tool:calculate')).toBe('calculate');
      expect(getToolNameFromScope('mcp:tool:roll_dice')).toBe('roll_dice');
    });

    it('should return undefined for non-tool scopes', () => {
      expect(getToolNameFromScope('mcp:read')).toBeUndefined();
      expect(getToolNameFromScope('openid')).toBeUndefined();
    });
  });

  describe('buildToolScope', () => {
    it('should build tool scope from tool name', () => {
      expect(buildToolScope('calculate')).toBe('mcp:tool:calculate');
      expect(buildToolScope('roll_dice')).toBe('mcp:tool:roll_dice');
      expect(buildToolScope('custom_tool')).toBe('mcp:tool:custom_tool');
    });
  });
});

// =============================================================================
// InsufficientScopeError Tests
// =============================================================================

describe('InsufficientScopeError', () => {
  it('should create error with required scopes', () => {
    const error = new InsufficientScopeError(
      ['mcp:write'],
      ['mcp:read']
    );

    expect(error.name).toBe('InsufficientScopeError');
    expect(error.code).toBe('insufficient_scope');
    expect(error.httpStatus).toBe(403);
    expect(error.requiredScopes).toEqual(['mcp:write']);
    expect(error.tokenScopes).toEqual(['mcp:read']);
  });

  it('should generate default message', () => {
    const error = new InsufficientScopeError(
      ['mcp:write', 'mcp:tool:calculate'],
      ['mcp:read']
    );

    expect(error.message).toBe('Insufficient scope. Required: mcp:write mcp:tool:calculate');
  });

  it('should accept custom message', () => {
    const error = new InsufficientScopeError(
      ['mcp:write'],
      ['mcp:read'],
      'Custom error message'
    );

    expect(error.message).toBe('Custom error message');
  });

  describe('getRequiredScopeString', () => {
    it('should return space-separated required scopes', () => {
      const error = new InsufficientScopeError(
        ['mcp:write', 'mcp:tool:calculate'],
        []
      );

      expect(error.getRequiredScopeString()).toBe('mcp:write mcp:tool:calculate');
    });
  });

  describe('buildWwwAuthenticateHeader', () => {
    it('should build WWW-Authenticate header', () => {
      const error = new InsufficientScopeError(
        ['mcp:write'],
        ['mcp:read']
      );

      const header = error.buildWwwAuthenticateHeader(
        'https://api.example.com/.well-known/oauth-protected-resource'
      );

      expect(header).toContain('Bearer');
      expect(header).toContain('resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"');
      expect(header).toContain('error="insufficient_scope"');
      expect(header).toContain('scope="mcp:write"');
    });

    it('should include realm if provided', () => {
      const error = new InsufficientScopeError(['mcp:write'], []);

      const header = error.buildWwwAuthenticateHeader(
        'https://api.example.com/.well-known/oauth-protected-resource',
        'MCP Server'
      );

      expect(header).toContain('realm="MCP Server"');
    });
  });
});

// =============================================================================
// ScopeManager Tests
// =============================================================================

describe('ScopeManager', () => {
  describe('constructor', () => {
    it('should create manager with default config', () => {
      const manager = new ScopeManager();
      expect(manager.getResourceMetadataUrl()).toBeUndefined();
      expect(manager.getRealm()).toBeUndefined();
    });

    it('should accept custom config', () => {
      const manager = new ScopeManager({
        resourceMetadataUrl: 'https://api.example.com/.well-known/oauth-protected-resource',
        realm: 'MCP Server',
      });

      expect(manager.getResourceMetadataUrl()).toBe('https://api.example.com/.well-known/oauth-protected-resource');
      expect(manager.getRealm()).toBe('MCP Server');
    });
  });

  describe('hasScope', () => {
    let manager: ScopeManager;

    beforeEach(() => {
      manager = new ScopeManager();
    });

    it('should return true when scope is present', () => {
      expect(manager.hasScope(['mcp:read', 'mcp:write'], 'mcp:read')).toBe(true);
      expect(manager.hasScope(['mcp:read', 'mcp:write'], 'mcp:write')).toBe(true);
    });

    it('should return false when scope is missing', () => {
      expect(manager.hasScope(['mcp:read'], 'mcp:write')).toBe(false);
      expect(manager.hasScope([], 'mcp:read')).toBe(false);
    });

    it('should accept space-separated string', () => {
      expect(manager.hasScope('mcp:read mcp:write', 'mcp:write')).toBe(true);
      expect(manager.hasScope('mcp:read', 'mcp:write')).toBe(false);
    });

    it('should check multiple required scopes', () => {
      expect(manager.hasScope(['mcp:read', 'mcp:write'], ['mcp:read', 'mcp:write'])).toBe(true);
      expect(manager.hasScope(['mcp:read'], ['mcp:read', 'mcp:write'])).toBe(false);
    });
  });

  describe('hasScopeWithInheritance', () => {
    let manager: ScopeManager;

    beforeEach(() => {
      manager = new ScopeManager();
    });

    it('should return true for direct match', () => {
      expect(manager.hasScopeWithInheritance(['mcp:read'], 'mcp:read')).toBe(true);
    });

    it('should return true when admin implies write', () => {
      expect(manager.hasScopeWithInheritance(['mcp:admin'], 'mcp:write')).toBe(true);
    });

    it('should return true when admin implies read', () => {
      expect(manager.hasScopeWithInheritance(['mcp:admin'], 'mcp:read')).toBe(true);
    });

    it('should return true when write implies read', () => {
      expect(manager.hasScopeWithInheritance(['mcp:write'], 'mcp:read')).toBe(true);
    });

    it('should not inherit in reverse (read does not imply write)', () => {
      expect(manager.hasScopeWithInheritance(['mcp:read'], 'mcp:write')).toBe(false);
    });

    it('should not inherit in reverse (write does not imply admin)', () => {
      expect(manager.hasScopeWithInheritance(['mcp:write'], 'mcp:admin')).toBe(false);
    });

    it('should not apply inheritance to tool scopes', () => {
      expect(manager.hasScopeWithInheritance(['mcp:admin'], 'mcp:tool:calculate')).toBe(false);
    });

    it('should accept space-separated string', () => {
      expect(manager.hasScopeWithInheritance('mcp:admin', 'mcp:read')).toBe(true);
    });
  });

  describe('checkScopes', () => {
    let manager: ScopeManager;

    beforeEach(() => {
      manager = new ScopeManager();
    });

    it('should return allowed for sufficient scopes', () => {
      const result = manager.checkScopes(['mcp:admin'], ['mcp:read', 'mcp:write']);
      expect(result.allowed).toBe(true);
      expect(result.missingScopes).toBeUndefined();
    });

    it('should return missing scopes for insufficient scopes', () => {
      const result = manager.checkScopes(['mcp:read'], ['mcp:read', 'mcp:write']);
      expect(result.allowed).toBe(false);
      expect(result.missingScopes).toEqual(['mcp:write']);
    });

    it('should return all missing scopes', () => {
      const result = manager.checkScopes([], ['mcp:read', 'mcp:write', 'mcp:admin']);
      expect(result.allowed).toBe(false);
      expect(result.missingScopes).toContain('mcp:read');
      expect(result.missingScopes).toContain('mcp:write');
      expect(result.missingScopes).toContain('mcp:admin');
    });

    it('should consider inheritance', () => {
      const result = manager.checkScopes(['mcp:admin'], ['mcp:read']);
      expect(result.allowed).toBe(true);
    });
  });

  describe('getRequiredScopes', () => {
    let manager: ScopeManager;

    beforeEach(() => {
      manager = new ScopeManager();
    });

    it('should return read scope for tools/list', () => {
      expect(manager.getRequiredScopes('tools/list')).toEqual(['mcp:read']);
    });

    it('should return read scope for resources/list', () => {
      expect(manager.getRequiredScopes('resources/list')).toEqual(['mcp:read']);
    });

    it('should return read scope for prompts/list', () => {
      expect(manager.getRequiredScopes('prompts/list')).toEqual(['mcp:read']);
    });

    it('should return write scope for tools/call', () => {
      expect(manager.getRequiredScopes('tools/call')).toEqual(['mcp:write']);
    });

    it('should return write scope for resources/subscribe', () => {
      expect(manager.getRequiredScopes('resources/subscribe')).toEqual(['mcp:write']);
    });

    it('should return admin scope for server/shutdown', () => {
      expect(manager.getRequiredScopes('server/shutdown')).toEqual(['mcp:admin']);
    });

    it('should include tool scope for tools/call with toolName', () => {
      const scopes = manager.getRequiredScopes('tools/call', 'calculate');
      expect(scopes).toContain('mcp:write');
      expect(scopes).toContain('mcp:tool:calculate');
    });

    it('should return empty array for unknown method', () => {
      expect(manager.getRequiredScopes('unknown/method')).toEqual([]);
    });
  });

  describe('validateMethodAccess', () => {
    let manager: ScopeManager;

    beforeEach(() => {
      manager = new ScopeManager();
    });

    it('should not throw for sufficient scopes', () => {
      expect(() => {
        manager.validateMethodAccess(['mcp:read'], 'tools/list');
      }).not.toThrow();
    });

    it('should throw InsufficientScopeError for insufficient scopes', () => {
      expect(() => {
        manager.validateMethodAccess(['mcp:read'], 'tools/call');
      }).toThrow(InsufficientScopeError);
    });

    it('should consider inheritance', () => {
      expect(() => {
        manager.validateMethodAccess(['mcp:admin'], 'tools/call');
      }).not.toThrow();
    });

    it('should not throw for unknown method (no scope required)', () => {
      expect(() => {
        manager.validateMethodAccess([], 'unknown/method');
      }).not.toThrow();
    });

    it('should include method in error message', () => {
      try {
        manager.validateMethodAccess(['mcp:read'], 'tools/call');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(InsufficientScopeError);
        expect((e as InsufficientScopeError).message).toContain('tools/call');
      }
    });
  });

  describe('validateToolAccess', () => {
    let manager: ScopeManager;

    beforeEach(() => {
      manager = new ScopeManager();
    });

    it('should not throw for sufficient scopes with tool scope', () => {
      expect(() => {
        manager.validateToolAccess(['mcp:write', 'mcp:tool:calculate'], 'calculate');
      }).not.toThrow();
    });

    it('should throw when missing mcp:write', () => {
      expect(() => {
        manager.validateToolAccess(['mcp:read', 'mcp:tool:calculate'], 'calculate');
      }).toThrow(InsufficientScopeError);
    });

    it('should throw when missing tool-specific scope', () => {
      expect(() => {
        manager.validateToolAccess(['mcp:write'], 'calculate');
      }).toThrow(InsufficientScopeError);
    });

    it('should use admin inheritance for write check', () => {
      expect(() => {
        manager.validateToolAccess(['mcp:admin', 'mcp:tool:calculate'], 'calculate');
      }).not.toThrow();
    });

    it('should skip tool scope check when requireToolScope is false', () => {
      expect(() => {
        manager.validateToolAccess(['mcp:write'], 'calculate', false);
      }).not.toThrow();
    });
  });

  describe('getEffectiveScopes', () => {
    let manager: ScopeManager;

    beforeEach(() => {
      manager = new ScopeManager();
    });

    it('should return input scopes without inheritance', () => {
      const result = manager.getEffectiveScopes(['mcp:read']);
      expect(result).toEqual(['mcp:read']);
    });

    it('should expand admin to include write and read', () => {
      const result = manager.getEffectiveScopes(['mcp:admin']);
      expect(result).toContain('mcp:admin');
      expect(result).toContain('mcp:write');
      expect(result).toContain('mcp:read');
    });

    it('should expand write to include read', () => {
      const result = manager.getEffectiveScopes(['mcp:write']);
      expect(result).toContain('mcp:write');
      expect(result).toContain('mcp:read');
    });

    it('should not duplicate scopes', () => {
      const result = manager.getEffectiveScopes(['mcp:admin', 'mcp:read']);
      const readCount = result.filter(s => s === 'mcp:read').length;
      expect(readCount).toBe(1);
    });

    it('should accept space-separated string', () => {
      const result = manager.getEffectiveScopes('mcp:admin');
      expect(result).toContain('mcp:admin');
      expect(result).toContain('mcp:write');
      expect(result).toContain('mcp:read');
    });

    it('should include non-inherited scopes unchanged', () => {
      const result = manager.getEffectiveScopes(['mcp:tool:calculate', 'openid']);
      expect(result).toContain('mcp:tool:calculate');
      expect(result).toContain('openid');
    });
  });

  describe('build403Response', () => {
    it('should build proper 403 response', () => {
      const manager = new ScopeManager({
        resourceMetadataUrl: 'https://api.example.com/.well-known/oauth-protected-resource',
        realm: 'MCP Server',
      });

      const error = new InsufficientScopeError(
        ['mcp:write'],
        ['mcp:read']
      );

      const response = manager.build403Response(error);

      expect(response.status).toBe(403);
      expect(response.headers['WWW-Authenticate']).toContain('Bearer');
      expect(response.headers['WWW-Authenticate']).toContain('insufficient_scope');
      expect(response.headers['WWW-Authenticate']).toContain('scope="mcp:write"');
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.body.error).toBe('insufficient_scope');
      expect(response.body.required_scope).toBe('mcp:write');
    });

    it('should throw if resourceMetadataUrl not configured', () => {
      const manager = new ScopeManager();
      const error = new InsufficientScopeError(['mcp:write'], []);

      expect(() => manager.build403Response(error)).toThrow('resourceMetadataUrl not configured');
    });
  });

  describe('custom method scopes', () => {
    it('should use custom method scopes', () => {
      const manager = new ScopeManager({
        customMethodScopes: {
          'custom/method': ['custom:scope'],
        },
      });

      expect(manager.getRequiredScopes('custom/method')).toEqual(['custom:scope']);
    });

    it('should override default method scopes', () => {
      const manager = new ScopeManager({
        customMethodScopes: {
          'tools/list': ['custom:read'],
        },
      });

      expect(manager.getRequiredScopes('tools/list')).toEqual(['custom:read']);
    });

    it('should preserve other default scopes', () => {
      const manager = new ScopeManager({
        customMethodScopes: {
          'custom/method': ['custom:scope'],
        },
      });

      expect(manager.getRequiredScopes('tools/list')).toEqual(['mcp:read']);
    });
  });
});

// =============================================================================
// Standalone Function Tests
// =============================================================================

describe('Standalone Functions', () => {
  describe('createScopeManager', () => {
    it('should create manager with defaults', () => {
      const manager = createScopeManager();
      expect(manager).toBeInstanceOf(ScopeManager);
    });

    it('should create manager with config', () => {
      const manager = createScopeManager({
        resourceMetadataUrl: 'https://api.example.com/.well-known/oauth-protected-resource',
      });
      expect(manager.getResourceMetadataUrl()).toBe('https://api.example.com/.well-known/oauth-protected-resource');
    });
  });

  describe('checkScopeWithInheritance', () => {
    it('should check scope with inheritance', () => {
      expect(checkScopeWithInheritance(['mcp:admin'], 'mcp:read')).toBe(true);
      expect(checkScopeWithInheritance(['mcp:read'], 'mcp:write')).toBe(false);
    });

    it('should accept string input', () => {
      expect(checkScopeWithInheritance('mcp:admin', 'mcp:read')).toBe(true);
    });
  });

  describe('getAllMcpScopes', () => {
    it('should return all MCP scopes', () => {
      const scopes = getAllMcpScopes();
      expect(scopes).toContain('mcp:read');
      expect(scopes).toContain('mcp:write');
      expect(scopes).toContain('mcp:admin');
      expect(scopes).toHaveLength(3);
    });
  });

  describe('getAllToolScopes', () => {
    it('should return all tool scopes', () => {
      const scopes = getAllToolScopes();
      expect(scopes).toContain('mcp:tool:calculate');
      expect(scopes).toContain('mcp:tool:roll_dice');
      expect(scopes).toContain('mcp:tool:tell_fortune');
      expect(scopes).toHaveLength(3);
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Scope Management Integration', () => {
  describe('Full scope validation flow', () => {
    it('should validate complete tools/call flow', () => {
      const manager = new ScopeManager({
        resourceMetadataUrl: 'https://api.example.com/.well-known/oauth-protected-resource',
      });

      // Token with admin scope should be able to call tools
      const adminScopes = 'mcp:admin mcp:tool:calculate';
      expect(() => {
        manager.validateToolAccess(adminScopes, 'calculate');
      }).not.toThrow();
    });

    it('should generate proper 403 for insufficient scope', () => {
      const manager = new ScopeManager({
        resourceMetadataUrl: 'https://api.example.com/.well-known/oauth-protected-resource',
        realm: 'MCP Test Server',
      });

      const tokenScopes = ['mcp:read'];

      try {
        manager.validateMethodAccess(tokenScopes, 'tools/call');
        expect.fail('Should have thrown InsufficientScopeError');
      } catch (e) {
        expect(e).toBeInstanceOf(InsufficientScopeError);
        const error = e as InsufficientScopeError;

        const response = manager.build403Response(error);
        expect(response.status).toBe(403);
        expect(response.headers['WWW-Authenticate']).toContain('realm="MCP Test Server"');
        expect(response.body.required_scope).toBe('mcp:write');
      }
    });
  });

  describe('Scope inheritance chain', () => {
    it('should properly chain admin -> write -> read', () => {
      const manager = new ScopeManager();

      // Admin can do everything
      expect(manager.hasScopeWithInheritance(['mcp:admin'], 'mcp:read')).toBe(true);
      expect(manager.hasScopeWithInheritance(['mcp:admin'], 'mcp:write')).toBe(true);
      expect(manager.hasScopeWithInheritance(['mcp:admin'], 'mcp:admin')).toBe(true);

      // Write can read but not admin
      expect(manager.hasScopeWithInheritance(['mcp:write'], 'mcp:read')).toBe(true);
      expect(manager.hasScopeWithInheritance(['mcp:write'], 'mcp:write')).toBe(true);
      expect(manager.hasScopeWithInheritance(['mcp:write'], 'mcp:admin')).toBe(false);

      // Read can only read
      expect(manager.hasScopeWithInheritance(['mcp:read'], 'mcp:read')).toBe(true);
      expect(manager.hasScopeWithInheritance(['mcp:read'], 'mcp:write')).toBe(false);
      expect(manager.hasScopeWithInheritance(['mcp:read'], 'mcp:admin')).toBe(false);
    });
  });

  describe('Tool-specific scope isolation', () => {
    it('should require specific tool scopes independently', () => {
      const manager = new ScopeManager();

      // Having one tool scope doesn't grant others
      const scopes = ['mcp:write', 'mcp:tool:calculate'];

      expect(() => {
        manager.validateToolAccess(scopes, 'calculate');
      }).not.toThrow();

      expect(() => {
        manager.validateToolAccess(scopes, 'roll_dice');
      }).toThrow(InsufficientScopeError);
    });
  });
});
