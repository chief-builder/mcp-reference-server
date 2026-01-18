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
// Pagination Types
// =============================================================================

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
 * Internal cursor data structure (before encoding)
 */
interface CursorData {
  /** Offset into the list */
  offset: number;
  /** Timestamp when cursor was created (for optional expiration) */
  timestamp: number;
  /** Checksum to validate cursor integrity */
  checksum: string;
}

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
// Cursor Secret Validation
// =============================================================================

/**
 * Get cursor secret from environment variable with fail-closed validation.
 * Throws at module load if secret is not set or is too short.
 *
 * @returns The cursor secret string
 * @throws Error if MCP_CURSOR_SECRET is not set or is less than 32 characters
 */
export function getCursorSecret(): string {
  const secret = process.env['MCP_CURSOR_SECRET'];
  if (!secret) {
    throw new Error('MCP_CURSOR_SECRET environment variable is required');
  }
  if (secret.length < 32) {
    throw new Error('MCP_CURSOR_SECRET must be at least 32 characters');
  }
  return secret;
}

// =============================================================================
// Cursor Creation and Parsing
// =============================================================================

/** Secret salt for cursor checksum - fail-fast validation at module load */
const CURSOR_SECRET = getCursorSecret();

/**
 * Generate checksum for cursor validation
 */
function generateChecksum(offset: number, timestamp: number): string {
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
export function createCursor(offset: number, _metadata?: Record<string, unknown>): string {
  const timestamp = Date.now();
  const checksum = generateChecksum(offset, timestamp);

  const cursorData: CursorData = {
    offset,
    timestamp,
    checksum,
  };

  // Encode as JSON then base64
  const json = JSON.stringify(cursorData);
  return Buffer.from(json, 'utf-8').toString('base64');
}

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
export function parseCursor(cursor: string): ParseCursorResult {
  // Empty or missing cursor starts from beginning
  if (!cursor || cursor.trim() === '') {
    return { valid: true, offset: 0 };
  }

  try {
    // Decode base64
    const json = Buffer.from(cursor, 'base64').toString('utf-8');

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
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
  } catch {
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
export function clampPageSize(
  pageSize?: number,
  defaultSize: number = DEFAULT_PAGE_SIZE,
  maxSize: number = MAX_PAGE_SIZE
): number {
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
export function paginate<T>(
  items: T[],
  cursor?: string,
  pageSize: number = DEFAULT_PAGE_SIZE
): PaginatedResult<T> {
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
export function emptyPaginatedResult<T>(): PaginatedResult<T> {
  return {
    items: [],
  };
}
