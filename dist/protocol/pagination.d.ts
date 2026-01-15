/**
 * Pagination Support for MCP List Operations
 *
 * Implements opaque cursor-based pagination with:
 * - Base64 encoded cursors containing offset and metadata
 * - Cursor validation to prevent manipulation
 * - Configurable page sizes with defaults and limits
 */
import { z } from 'zod';
/** Default number of items per page */
export declare const DEFAULT_PAGE_SIZE = 50;
/** Maximum allowed items per page */
export declare const MAX_PAGE_SIZE = 200;
/** Minimum allowed items per page */
export declare const MIN_PAGE_SIZE = 1;
/**
 * Parameters for paginated list requests
 */
export interface PaginationParams {
    /** Opaque cursor from previous response */
    cursor?: string;
}
/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
    /** Items in the current page */
    items: T[];
    /** Cursor for next page, undefined if no more pages */
    nextCursor?: string;
}
/**
 * Schema for pagination params in requests
 */
export declare const PaginationParamsSchema: z.ZodOptional<z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    cursor?: string | undefined;
}, {
    cursor?: string | undefined;
}>>;
/**
 * Create an opaque cursor for pagination
 *
 * @param offset - Current position in the list
 * @param _metadata - Optional additional metadata (reserved for future use)
 * @returns Base64-encoded opaque cursor string
 */
export declare function createCursor(offset: number, _metadata?: Record<string, unknown>): string;
/**
 * Parse result from cursor parsing
 */
export interface ParseCursorResult {
    /** Whether parsing was successful */
    valid: boolean;
    /** Offset from cursor (0 if invalid) */
    offset: number;
    /** Error message if invalid */
    error?: string;
}
/**
 * Parse and validate an opaque cursor
 *
 * @param cursor - Base64-encoded cursor string
 * @returns Parse result with offset or error
 */
export declare function parseCursor(cursor: string): ParseCursorResult;
/**
 * Clamp page size to valid range
 *
 * @param pageSize - Requested page size
 * @param defaultSize - Default size if not specified
 * @param maxSize - Maximum allowed size
 * @returns Clamped page size within valid range
 */
export declare function clampPageSize(pageSize?: number, defaultSize?: number, maxSize?: number): number;
/**
 * Apply pagination to an array of items
 *
 * @param items - Full array of items to paginate
 * @param cursor - Optional cursor from previous request
 * @param pageSize - Number of items per page
 * @returns Paginated result with items and optional next cursor
 */
export declare function paginate<T>(items: T[], cursor?: string, pageSize?: number): PaginatedResult<T>;
/**
 * Create an empty paginated result
 */
export declare function emptyPaginatedResult<T>(): PaginatedResult<T>;
//# sourceMappingURL=pagination.d.ts.map