import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCursor,
  parseCursor,
  clampPageSize,
  paginate,
  emptyPaginatedResult,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  PaginationParamsSchema,
  type PaginatedResult,
} from '../../../src/protocol/pagination.js';
import { ToolRegistry, Tool } from '../../../src/tools/registry.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestItems(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `item_${i}`);
}

function createSimpleTool(name: string): Tool {
  return {
    name,
    description: `Test tool ${name}`,
    inputSchema: { type: 'object' },
    handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  };
}

// =============================================================================
// Cursor Creation Tests
// =============================================================================

describe('createCursor', () => {
  it('should create a base64 encoded cursor', () => {
    const cursor = createCursor(10);
    expect(cursor).toBeDefined();
    expect(typeof cursor).toBe('string');
    // Should be valid base64
    expect(() => Buffer.from(cursor, 'base64')).not.toThrow();
  });

  it('should create different cursors for different offsets', () => {
    const cursor1 = createCursor(10);
    const cursor2 = createCursor(20);
    expect(cursor1).not.toBe(cursor2);
  });

  it('should include timestamp (cursors at same offset differ over time)', async () => {
    const cursor1 = createCursor(10);
    // Wait a small amount to get different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cursor2 = createCursor(10);
    // Cursors should be different due to different timestamps
    expect(cursor1).not.toBe(cursor2);
  });

  it('should handle zero offset', () => {
    const cursor = createCursor(0);
    expect(cursor).toBeDefined();
    const result = parseCursor(cursor);
    expect(result.valid).toBe(true);
    expect(result.offset).toBe(0);
  });

  it('should handle large offsets', () => {
    const cursor = createCursor(1000000);
    const result = parseCursor(cursor);
    expect(result.valid).toBe(true);
    expect(result.offset).toBe(1000000);
  });
});

// =============================================================================
// Cursor Parsing Tests
// =============================================================================

describe('parseCursor', () => {
  it('should parse a valid cursor', () => {
    const cursor = createCursor(25);
    const result = parseCursor(cursor);

    expect(result.valid).toBe(true);
    expect(result.offset).toBe(25);
    expect(result.error).toBeUndefined();
  });

  it('should return offset 0 for empty cursor', () => {
    const result = parseCursor('');
    expect(result.valid).toBe(true);
    expect(result.offset).toBe(0);
  });

  it('should return offset 0 for whitespace cursor', () => {
    const result = parseCursor('   ');
    expect(result.valid).toBe(true);
    expect(result.offset).toBe(0);
  });

  it('should reject invalid base64', () => {
    const result = parseCursor('not-valid-base64!!!');
    expect(result.valid).toBe(false);
    expect(result.offset).toBe(0);
    expect(result.error).toBeDefined();
  });

  it('should reject non-JSON content', () => {
    const cursor = Buffer.from('not json').toString('base64');
    const result = parseCursor(cursor);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid cursor format');
  });

  it('should reject tampered cursor (modified offset)', () => {
    // Create valid cursor
    const cursor = createCursor(10);
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));

    // Tamper with offset
    decoded.offset = 999;
    const tamperedCursor = Buffer.from(JSON.stringify(decoded)).toString('base64');

    const result = parseCursor(tamperedCursor);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('checksum');
  });

  it('should reject cursor with missing fields', () => {
    const invalid = { offset: 10 }; // Missing timestamp and checksum
    const cursor = Buffer.from(JSON.stringify(invalid)).toString('base64');

    const result = parseCursor(cursor);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('structure');
  });

  it('should reject cursor with negative offset', () => {
    const invalid = { offset: -5, timestamp: Date.now(), checksum: 'abc' };
    const cursor = Buffer.from(JSON.stringify(invalid)).toString('base64');

    const result = parseCursor(cursor);
    expect(result.valid).toBe(false);
  });

  it('should reject cursor with non-integer offset', () => {
    const invalid = { offset: 10.5, timestamp: Date.now(), checksum: 'abc' };
    const cursor = Buffer.from(JSON.stringify(invalid)).toString('base64');

    const result = parseCursor(cursor);
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Page Size Clamping Tests
// =============================================================================

describe('clampPageSize', () => {
  it('should return default for undefined', () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('should return default for null', () => {
    expect(clampPageSize(null as unknown as number)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('should clamp to minimum', () => {
    expect(clampPageSize(0)).toBe(MIN_PAGE_SIZE);
    expect(clampPageSize(-10)).toBe(MIN_PAGE_SIZE);
  });

  it('should clamp to maximum', () => {
    expect(clampPageSize(1000)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(500)).toBe(MAX_PAGE_SIZE);
  });

  it('should preserve valid values', () => {
    expect(clampPageSize(50)).toBe(50);
    expect(clampPageSize(100)).toBe(100);
    expect(clampPageSize(1)).toBe(1);
    expect(clampPageSize(200)).toBe(200);
  });

  it('should use custom default', () => {
    expect(clampPageSize(undefined, 25)).toBe(25);
  });

  it('should use custom maximum', () => {
    expect(clampPageSize(150, 50, 100)).toBe(100);
  });
});

// =============================================================================
// Paginate Helper Tests
// =============================================================================

describe('paginate', () => {
  it('should return first page without cursor', () => {
    const items = createTestItems(100);
    const result = paginate(items, undefined, 10);

    expect(result.items).toHaveLength(10);
    expect(result.items[0]).toBe('item_0');
    expect(result.items[9]).toBe('item_9');
    expect(result.nextCursor).toBeDefined();
  });

  it('should return second page with cursor', () => {
    const items = createTestItems(100);
    const page1 = paginate(items, undefined, 10);
    const page2 = paginate(items, page1.nextCursor, 10);

    expect(page2.items).toHaveLength(10);
    expect(page2.items[0]).toBe('item_10');
    expect(page2.items[9]).toBe('item_19');
    expect(page2.nextCursor).toBeDefined();
  });

  it('should return no cursor on last page', () => {
    const items = createTestItems(25);
    const page1 = paginate(items, undefined, 10);
    const page2 = paginate(items, page1.nextCursor, 10);
    const page3 = paginate(items, page2.nextCursor, 10);

    expect(page3.items).toHaveLength(5);
    expect(page3.nextCursor).toBeUndefined();
  });

  it('should handle empty array', () => {
    const result = paginate([], undefined, 10);

    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeUndefined();
  });

  it('should handle single item', () => {
    const result = paginate(['only_one'], undefined, 10);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toBe('only_one');
    expect(result.nextCursor).toBeUndefined();
  });

  it('should handle page size larger than items', () => {
    const items = createTestItems(5);
    const result = paginate(items, undefined, 100);

    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeUndefined();
  });

  it('should handle invalid cursor by starting from beginning', () => {
    const items = createTestItems(20);
    const result = paginate(items, 'invalid-cursor', 10);

    expect(result.items).toHaveLength(10);
    expect(result.items[0]).toBe('item_0');
  });

  it('should iterate through all items', () => {
    const items = createTestItems(53);
    const collected: string[] = [];
    let cursor: string | undefined;

    do {
      const page = paginate(items, cursor, 10);
      collected.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    expect(collected).toHaveLength(53);
    expect(collected[0]).toBe('item_0');
    expect(collected[52]).toBe('item_52');
  });

  it('should use default page size', () => {
    const items = createTestItems(100);
    const result = paginate(items);

    expect(result.items).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it('should clamp page size', () => {
    const items = createTestItems(500);
    const result = paginate(items, undefined, 1000);

    expect(result.items).toHaveLength(MAX_PAGE_SIZE);
  });
});

// =============================================================================
// Empty Result Helper Tests
// =============================================================================

describe('emptyPaginatedResult', () => {
  it('should return empty items array', () => {
    const result = emptyPaginatedResult<string>();
    expect(result.items).toEqual([]);
  });

  it('should have undefined nextCursor', () => {
    const result = emptyPaginatedResult<number>();
    expect(result.nextCursor).toBeUndefined();
  });
});

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('PaginationParamsSchema', () => {
  it('should accept empty object', () => {
    const result = PaginationParamsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept undefined', () => {
    const result = PaginationParamsSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it('should accept valid cursor', () => {
    const result = PaginationParamsSchema.safeParse({ cursor: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('should reject extra properties', () => {
    const result = PaginationParamsSchema.safeParse({ cursor: 'abc', extra: 'field' });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Integration with ToolRegistry Tests
// =============================================================================

describe('ToolRegistry Pagination Integration', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should paginate tools correctly', () => {
    // Register 25 tools
    for (let i = 0; i < 25; i++) {
      registry.registerTool(createSimpleTool(`tool_${i.toString().padStart(2, '0')}`));
    }

    const page1 = registry.listTools(undefined, 10);
    expect(page1.tools).toHaveLength(10);
    expect(page1.tools[0].name).toBe('tool_00');
    expect(page1.nextCursor).toBeDefined();

    const page2 = registry.listTools(page1.nextCursor, 10);
    expect(page2.tools).toHaveLength(10);
    expect(page2.tools[0].name).toBe('tool_10');
    expect(page2.nextCursor).toBeDefined();

    const page3 = registry.listTools(page2.nextCursor, 10);
    expect(page3.tools).toHaveLength(5);
    expect(page3.tools[0].name).toBe('tool_20');
    expect(page3.nextCursor).toBeUndefined();
  });

  it('should handle default page size', () => {
    // Register more than default page size
    for (let i = 0; i < 60; i++) {
      registry.registerTool(createSimpleTool(`tool_${i}`));
    }

    const page1 = registry.listTools();
    expect(page1.tools).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(page1.nextCursor).toBeDefined();
  });

  it('should handle invalid cursor by starting from beginning', () => {
    for (let i = 0; i < 10; i++) {
      registry.registerTool(createSimpleTool(`tool_${i}`));
    }

    const result = registry.listTools('invalid-cursor', 5);
    expect(result.tools).toHaveLength(5);
    expect(result.tools[0].name).toBe('tool_0');
  });

  it('should respect max page size', () => {
    for (let i = 0; i < 300; i++) {
      registry.registerTool(createSimpleTool(`tool_${i}`));
    }

    const result = registry.listTools(undefined, 500);
    expect(result.tools).toHaveLength(MAX_PAGE_SIZE);
  });

  it('should return empty result for empty registry', () => {
    const result = registry.listTools();
    expect(result.tools).toHaveLength(0);
    expect(result.nextCursor).toBeUndefined();
  });

  it('should iterate through all tools', () => {
    const toolCount = 127;
    for (let i = 0; i < toolCount; i++) {
      registry.registerTool(createSimpleTool(`tool_${i}`));
    }

    const allTools: string[] = [];
    let cursor: string | undefined;
    const pageSize = 25;

    do {
      const page = registry.listTools(cursor, pageSize);
      allTools.push(...page.tools.map((t) => t.name));
      cursor = page.nextCursor;
    } while (cursor);

    expect(allTools).toHaveLength(toolCount);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle cursor at exact boundary', () => {
    const items = createTestItems(50);
    const page1 = paginate(items, undefined, 50);

    expect(page1.items).toHaveLength(50);
    expect(page1.nextCursor).toBeUndefined();
  });

  it('should handle cursor beyond array length', () => {
    const items = createTestItems(10);
    const farCursor = createCursor(100);
    const result = paginate(items, farCursor, 10);

    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeUndefined();
  });

  it('should handle page size of 1', () => {
    const items = createTestItems(3);
    const page1 = paginate(items, undefined, 1);
    const page2 = paginate(items, page1.nextCursor, 1);
    const page3 = paginate(items, page2.nextCursor, 1);

    expect(page1.items).toEqual(['item_0']);
    expect(page1.nextCursor).toBeDefined();
    expect(page2.items).toEqual(['item_1']);
    expect(page2.nextCursor).toBeDefined();
    expect(page3.items).toEqual(['item_2']);
    expect(page3.nextCursor).toBeUndefined(); // Last page has no next cursor
  });

  it('should preserve item order across pages', () => {
    const items = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
    const page1 = paginate(items, undefined, 2);
    const page2 = paginate(items, page1.nextCursor, 2);
    const page3 = paginate(items, page2.nextCursor, 2);

    expect([...page1.items, ...page2.items, ...page3.items]).toEqual(items);
  });
});
