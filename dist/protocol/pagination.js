/**
 * Pagination Support for MCP List Operations
 *
 * Implements opaque cursor-based pagination with:
 * - Base64 encoded cursors containing offset and metadata
 * - Cursor validation to prevent manipulation
 * - Configurable page sizes with defaults and limits
 */
import { z } from 'zod';
import { createHash } from 'crypto';
// =============================================================================
// Pagination Configuration Constants
// =============================================================================
/** Default number of items per page */
export const DEFAULT_PAGE_SIZE = 50;
/** Maximum allowed items per page */
export const MAX_PAGE_SIZE = 200;
/** Minimum allowed items per page */
export const MIN_PAGE_SIZE = 1;
// =============================================================================
// Zod Schemas for Validation
// =============================================================================
/**
 * Schema for pagination params in requests
 */
export const PaginationParamsSchema = z.object({
    cursor: z.string().optional(),
}).strict().optional();
/**
 * Schema for internal cursor data validation
 */
const CursorDataSchema = z.object({
    offset: z.number().int().nonnegative(),
    timestamp: z.number().int().positive(),
    checksum: z.string().min(1),
});
// =============================================================================
// Cursor Creation and Parsing
// =============================================================================
/** Secret salt for cursor checksum (in production, use env variable) */
const CURSOR_SECRET = process.env['MCP_CURSOR_SECRET'] ?? 'mcp-pagination-secret';
/**
 * Generate checksum for cursor validation
 */
function generateChecksum(offset, timestamp) {
    const data = `${offset}:${timestamp}:${CURSOR_SECRET}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
}
/**
 * Create an opaque cursor for pagination
 *
 * @param offset - Current position in the list
 * @param _metadata - Optional additional metadata (reserved for future use)
 * @returns Base64-encoded opaque cursor string
 */
export function createCursor(offset, _metadata) {
    const timestamp = Date.now();
    const checksum = generateChecksum(offset, timestamp);
    const cursorData = {
        offset,
        timestamp,
        checksum,
    };
    // Encode as JSON then base64
    const json = JSON.stringify(cursorData);
    return Buffer.from(json, 'utf-8').toString('base64');
}
/**
 * Parse and validate an opaque cursor
 *
 * @param cursor - Base64-encoded cursor string
 * @returns Parse result with offset or error
 */
export function parseCursor(cursor) {
    // Empty or missing cursor starts from beginning
    if (!cursor || cursor.trim() === '') {
        return { valid: true, offset: 0 };
    }
    try {
        // Decode base64
        const json = Buffer.from(cursor, 'base64').toString('utf-8');
        // Parse JSON
        let parsed;
        try {
            parsed = JSON.parse(json);
        }
        catch {
            return { valid: false, offset: 0, error: 'Invalid cursor format' };
        }
        // Validate structure
        const validation = CursorDataSchema.safeParse(parsed);
        if (!validation.success) {
            return { valid: false, offset: 0, error: 'Invalid cursor structure' };
        }
        const cursorData = validation.data;
        // Validate checksum to prevent tampering
        const expectedChecksum = generateChecksum(cursorData.offset, cursorData.timestamp);
        if (cursorData.checksum !== expectedChecksum) {
            return { valid: false, offset: 0, error: 'Invalid cursor checksum' };
        }
        // Cursor is valid
        return { valid: true, offset: cursorData.offset };
    }
    catch {
        return { valid: false, offset: 0, error: 'Failed to parse cursor' };
    }
}
// =============================================================================
// Page Size Helpers
// =============================================================================
/**
 * Clamp page size to valid range
 *
 * @param pageSize - Requested page size
 * @param defaultSize - Default size if not specified
 * @param maxSize - Maximum allowed size
 * @returns Clamped page size within valid range
 */
export function clampPageSize(pageSize, defaultSize = DEFAULT_PAGE_SIZE, maxSize = MAX_PAGE_SIZE) {
    if (pageSize === undefined || pageSize === null) {
        return defaultSize;
    }
    return Math.max(MIN_PAGE_SIZE, Math.min(pageSize, maxSize));
}
// =============================================================================
// Pagination Helper Function
// =============================================================================
/**
 * Apply pagination to an array of items
 *
 * @param items - Full array of items to paginate
 * @param cursor - Optional cursor from previous request
 * @param pageSize - Number of items per page
 * @returns Paginated result with items and optional next cursor
 */
export function paginate(items, cursor, pageSize = DEFAULT_PAGE_SIZE) {
    // Parse cursor to get offset
    const parseResult = parseCursor(cursor ?? '');
    const startOffset = parseResult.valid ? parseResult.offset : 0;
    // Clamp page size
    const effectivePageSize = clampPageSize(pageSize);
    // Calculate slice bounds
    const endOffset = Math.min(startOffset + effectivePageSize, items.length);
    // Get page items
    const pageItems = items.slice(startOffset, endOffset);
    // Generate next cursor if there are more items
    if (endOffset < items.length) {
        return {
            items: pageItems,
            nextCursor: createCursor(endOffset),
        };
    }
    return {
        items: pageItems,
    };
}
/**
 * Create an empty paginated result
 */
export function emptyPaginatedResult() {
    return {
        items: [],
    };
}
//# sourceMappingURL=pagination.js.map