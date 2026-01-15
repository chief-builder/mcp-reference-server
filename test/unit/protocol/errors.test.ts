import { describe, it, expect } from 'vitest';
import {
  // Error codes
  PARSE_ERROR,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  INVALID_PARAMS,
  INTERNAL_ERROR,
  REQUEST_CANCELLED,
  CONTENT_TOO_LARGE,
  SERVER_ERROR_START,
  SERVER_ERROR_END,
  ERROR_DESCRIPTIONS,
  // Error classes
  McpError,
  ParseError,
  InvalidRequestError,
  MethodNotFoundError,
  InvalidParamsError,
  InternalError,
  RequestCancelledError,
  ContentTooLargeError,
  ToolExecutionError,
  // Factory functions
  createParseError,
  createInvalidRequest,
  createMethodNotFound,
  createInvalidParams,
  createInternalError,
  // Tool result helpers
  createToolErrorResult,
  createToolSuccessResult,
  // Error response helpers
  toErrorResponse,
  fromError,
  createErrorResponseFromError,
  // Type guards
  isMcpError,
  isParseError,
  isInvalidRequestError,
  isMethodNotFoundError,
  isInvalidParamsError,
  isInternalError,
  isToolExecutionError,
  isServerErrorCode,
  isStandardErrorCode,
} from '../../../src/protocol/errors.js';

describe('MCP Errors', () => {
  describe('Error Codes', () => {
    it('should have correct JSON-RPC 2.0 standard error codes', () => {
      expect(PARSE_ERROR).toBe(-32700);
      expect(INVALID_REQUEST).toBe(-32600);
      expect(METHOD_NOT_FOUND).toBe(-32601);
      expect(INVALID_PARAMS).toBe(-32602);
      expect(INTERNAL_ERROR).toBe(-32603);
    });

    it('should have correct server error range', () => {
      expect(SERVER_ERROR_START).toBe(-32000);
      expect(SERVER_ERROR_END).toBe(-32099);
    });

    it('should have correct MCP-specific error codes', () => {
      expect(REQUEST_CANCELLED).toBe(-32800);
      expect(CONTENT_TOO_LARGE).toBe(-32801);
    });

    it('should have error descriptions for all codes', () => {
      expect(ERROR_DESCRIPTIONS[PARSE_ERROR]).toBeDefined();
      expect(ERROR_DESCRIPTIONS[INVALID_REQUEST]).toBeDefined();
      expect(ERROR_DESCRIPTIONS[METHOD_NOT_FOUND]).toBeDefined();
      expect(ERROR_DESCRIPTIONS[INVALID_PARAMS]).toBeDefined();
      expect(ERROR_DESCRIPTIONS[INTERNAL_ERROR]).toBeDefined();
      expect(ERROR_DESCRIPTIONS[REQUEST_CANCELLED]).toBeDefined();
      expect(ERROR_DESCRIPTIONS[CONTENT_TOO_LARGE]).toBeDefined();
    });
  });

  describe('McpError', () => {
    it('should create error with code and message', () => {
      const error = new McpError(-32600, 'Test error');
      expect(error.code).toBe(-32600);
      expect(error.message).toBe('Test error');
      expect(error.data).toBeUndefined();
      expect(error.name).toBe('McpError');
    });

    it('should create error with data', () => {
      const error = new McpError(-32600, 'Test error', { field: 'name' });
      expect(error.data).toEqual({ field: 'name' });
    });

    it('should be an instance of Error', () => {
      const error = new McpError(-32600, 'Test');
      expect(error).toBeInstanceOf(Error);
    });

    it('should serialize to JSON without stack trace', () => {
      const error = new McpError(-32600, 'Test error', { detail: 'info' });
      const json = error.toJSON();
      expect(json).toEqual({
        code: -32600,
        message: 'Test error',
        data: { detail: 'info' },
      });
      expect(json).not.toHaveProperty('stack');
    });

    it('should omit data from JSON if undefined', () => {
      const error = new McpError(-32600, 'Test error');
      const json = error.toJSON();
      expect(json).toEqual({
        code: -32600,
        message: 'Test error',
      });
      expect('data' in json).toBe(false);
    });
  });

  describe('Specific Error Classes', () => {
    describe('ParseError', () => {
      it('should have correct code and message', () => {
        const error = new ParseError();
        expect(error.code).toBe(PARSE_ERROR);
        expect(error.message).toBe('Parse error: Invalid JSON');
        expect(error.name).toBe('ParseError');
      });

      it('should accept optional data', () => {
        const error = new ParseError('unexpected token');
        expect(error.data).toBe('unexpected token');
      });
    });

    describe('InvalidRequestError', () => {
      it('should have correct code and default message', () => {
        const error = new InvalidRequestError();
        expect(error.code).toBe(INVALID_REQUEST);
        expect(error.message).toBe('Invalid Request');
        expect(error.name).toBe('InvalidRequestError');
      });

      it('should accept custom message', () => {
        const error = new InvalidRequestError('Missing jsonrpc field');
        expect(error.message).toBe('Missing jsonrpc field');
      });

      it('should accept data', () => {
        const error = new InvalidRequestError('Invalid', { field: 'method' });
        expect(error.data).toEqual({ field: 'method' });
      });
    });

    describe('MethodNotFoundError', () => {
      it('should include method name in message and data', () => {
        const error = new MethodNotFoundError('tools/call');
        expect(error.code).toBe(METHOD_NOT_FOUND);
        expect(error.message).toBe('Method not found: tools/call');
        expect(error.data).toEqual({ method: 'tools/call' });
        expect(error.name).toBe('MethodNotFoundError');
      });
    });

    describe('InvalidParamsError', () => {
      it('should have correct code and default message', () => {
        const error = new InvalidParamsError();
        expect(error.code).toBe(INVALID_PARAMS);
        expect(error.message).toBe('Invalid params');
        expect(error.name).toBe('InvalidParamsError');
      });

      it('should accept custom message and data', () => {
        const error = new InvalidParamsError('Missing required field', {
          field: 'name',
        });
        expect(error.message).toBe('Missing required field');
        expect(error.data).toEqual({ field: 'name' });
      });
    });

    describe('InternalError', () => {
      it('should have correct code and default message', () => {
        const error = new InternalError();
        expect(error.code).toBe(INTERNAL_ERROR);
        expect(error.message).toBe('Internal error');
        expect(error.name).toBe('InternalError');
      });

      it('should accept custom message', () => {
        const error = new InternalError('Database connection failed');
        expect(error.message).toBe('Database connection failed');
      });
    });

    describe('RequestCancelledError', () => {
      it('should have correct code and message', () => {
        const error = new RequestCancelledError();
        expect(error.code).toBe(REQUEST_CANCELLED);
        expect(error.message).toBe('Request cancelled');
        expect(error.name).toBe('RequestCancelledError');
        expect(error.data).toBeUndefined();
      });

      it('should include request ID in data', () => {
        const error = new RequestCancelledError('req-123');
        expect(error.data).toEqual({ requestId: 'req-123' });
      });

      it('should include numeric request ID', () => {
        const error = new RequestCancelledError(42);
        expect(error.data).toEqual({ requestId: 42 });
      });
    });

    describe('ContentTooLargeError', () => {
      it('should have correct code and message', () => {
        const error = new ContentTooLargeError();
        expect(error.code).toBe(CONTENT_TOO_LARGE);
        expect(error.message).toBe('Content too large');
        expect(error.name).toBe('ContentTooLargeError');
        expect(error.data).toBeUndefined();
      });

      it('should include size information in data', () => {
        const error = new ContentTooLargeError(2000000, 1000000);
        expect(error.data).toEqual({ actualSize: 2000000, maxSize: 1000000 });
      });

      it('should handle partial size information', () => {
        const error = new ContentTooLargeError(undefined, 1000000);
        expect(error.data).toEqual({ actualSize: undefined, maxSize: 1000000 });
      });
    });
  });

  describe('Factory Functions', () => {
    it('createParseError should create ParseError', () => {
      const error = createParseError('details');
      expect(error).toBeInstanceOf(ParseError);
      expect(error.code).toBe(PARSE_ERROR);
      expect(error.data).toBe('details');
    });

    it('createInvalidRequest should create InvalidRequestError', () => {
      const error = createInvalidRequest('custom message', { info: 'test' });
      expect(error).toBeInstanceOf(InvalidRequestError);
      expect(error.message).toBe('custom message');
      expect(error.data).toEqual({ info: 'test' });
    });

    it('createMethodNotFound should create MethodNotFoundError', () => {
      const error = createMethodNotFound('unknown/method');
      expect(error).toBeInstanceOf(MethodNotFoundError);
      expect(error.message).toContain('unknown/method');
    });

    it('createInvalidParams should create InvalidParamsError', () => {
      const error = createInvalidParams('Missing field', { field: 'x' });
      expect(error).toBeInstanceOf(InvalidParamsError);
    });

    it('createInternalError should create InternalError', () => {
      const error = createInternalError('Server error');
      expect(error).toBeInstanceOf(InternalError);
    });
  });

  describe('Tool Execution Errors (SEP-1303)', () => {
    describe('ToolExecutionError', () => {
      it('should create error with tool name and message', () => {
        const error = new ToolExecutionError('calculator', 'Division by zero');
        expect(error.toolName).toBe('calculator');
        expect(error.message).toBe('Division by zero');
        expect(error.name).toBe('ToolExecutionError');
        expect(error.details).toBeUndefined();
      });

      it('should accept details', () => {
        const error = new ToolExecutionError('calculator', 'Error', {
          input: 'bad',
        });
        expect(error.details).toEqual({ input: 'bad' });
      });

      it('should be an instance of Error', () => {
        const error = new ToolExecutionError('test', 'message');
        expect(error).toBeInstanceOf(Error);
      });

      it('should convert to tool result with isError: true', () => {
        const error = new ToolExecutionError('calculator', 'Division by zero');
        const result = error.toToolResult();
        expect(result.isError).toBe(true);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('calculator');
        expect(result.content[0].text).toContain('Division by zero');
      });
    });

    describe('createToolErrorResult', () => {
      it('should create error result with isError: true', () => {
        const result = createToolErrorResult('Something went wrong');
        expect(result.isError).toBe(true);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toBe('Something went wrong');
      });

      it('should include tool name in message', () => {
        const result = createToolErrorResult('Failed', 'myTool');
        expect(result.content[0].text).toBe("Tool 'myTool' failed: Failed");
      });

      it('should include details in message', () => {
        const result = createToolErrorResult('Failed', 'tool', { reason: 'bad input' });
        expect(result.content[0].text).toContain('Details:');
        expect(result.content[0].text).toContain('bad input');
      });

      it('should handle string details', () => {
        const result = createToolErrorResult('Failed', undefined, 'extra info');
        expect(result.content[0].text).toContain('Details: extra info');
      });

      it('should handle circular reference in details gracefully', () => {
        const circular: Record<string, unknown> = { name: 'test' };
        circular.self = circular;
        // Should not throw
        const result = createToolErrorResult('Failed', undefined, circular);
        expect(result.isError).toBe(true);
      });
    });

    describe('createToolSuccessResult', () => {
      it('should create success result without isError', () => {
        const result = createToolSuccessResult('Result: 42');
        expect(result.isError).toBeUndefined();
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toBe('Result: 42');
      });
    });
  });

  describe('Error Response Helpers', () => {
    describe('toErrorResponse', () => {
      it('should convert McpError to JSON-RPC error response', () => {
        const error = new InvalidRequestError('Bad request');
        const response = toErrorResponse(error, 'req-1');

        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBe('req-1');
        expect(response.error.code).toBe(INVALID_REQUEST);
        expect(response.error.message).toBe('Bad request');
      });

      it('should include error data in response', () => {
        const error = new InvalidParamsError('Missing field', { field: 'name' });
        const response = toErrorResponse(error, 42);

        expect(response.error.data).toEqual({ field: 'name' });
      });

      it('should handle null request ID', () => {
        const error = new ParseError();
        const response = toErrorResponse(error, null);

        expect(response.id).toBeNull();
      });
    });

    describe('fromError', () => {
      it('should return McpError as-is', () => {
        const original = new InvalidRequestError('test');
        const result = fromError(original);
        expect(result).toBe(original);
      });

      it('should wrap standard Error in InternalError', () => {
        const error = new Error('Something broke');
        const result = fromError(error);

        expect(result).toBeInstanceOf(InternalError);
        expect(result.code).toBe(INTERNAL_ERROR);
        expect(result.message).toContain('Something broke');
        // Should not expose stack trace
        expect(result.message).not.toContain('at ');
      });

      it('should wrap string in InternalError', () => {
        const result = fromError('string error');

        expect(result).toBeInstanceOf(InternalError);
        expect(result.message).toContain('string error');
      });

      it('should wrap unknown types in InternalError', () => {
        const result = fromError({ random: 'object' });

        expect(result).toBeInstanceOf(InternalError);
        expect(result.message).toBe('An unexpected internal error occurred');
      });

      it('should wrap null in InternalError', () => {
        const result = fromError(null);
        expect(result).toBeInstanceOf(InternalError);
      });

      it('should wrap undefined in InternalError', () => {
        const result = fromError(undefined);
        expect(result).toBeInstanceOf(InternalError);
      });
    });

    describe('createErrorResponseFromError', () => {
      it('should create error response from any error', () => {
        const response = createErrorResponseFromError(
          new Error('Something failed'),
          'req-99'
        );

        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBe('req-99');
        expect(response.error.code).toBe(INTERNAL_ERROR);
        expect(response.error.message).toContain('Something failed');
      });

      it('should preserve McpError properties', () => {
        const response = createErrorResponseFromError(
          new MethodNotFoundError('test/method'),
          1
        );

        expect(response.error.code).toBe(METHOD_NOT_FOUND);
        expect(response.error.message).toContain('test/method');
        expect(response.error.data).toEqual({ method: 'test/method' });
      });
    });
  });

  describe('Type Guards', () => {
    describe('isMcpError', () => {
      it('should return true for McpError', () => {
        expect(isMcpError(new McpError(-32600, 'test'))).toBe(true);
      });

      it('should return true for subclasses', () => {
        expect(isMcpError(new ParseError())).toBe(true);
        expect(isMcpError(new InvalidRequestError())).toBe(true);
        expect(isMcpError(new InternalError())).toBe(true);
      });

      it('should return false for regular Error', () => {
        expect(isMcpError(new Error('test'))).toBe(false);
      });

      it('should return false for non-errors', () => {
        expect(isMcpError('string')).toBe(false);
        expect(isMcpError(null)).toBe(false);
        expect(isMcpError(undefined)).toBe(false);
      });
    });

    describe('specific error type guards', () => {
      it('isParseError', () => {
        expect(isParseError(new ParseError())).toBe(true);
        expect(isParseError(new InvalidRequestError())).toBe(false);
        expect(isParseError(new Error())).toBe(false);
      });

      it('isInvalidRequestError', () => {
        expect(isInvalidRequestError(new InvalidRequestError())).toBe(true);
        expect(isInvalidRequestError(new ParseError())).toBe(false);
      });

      it('isMethodNotFoundError', () => {
        expect(isMethodNotFoundError(new MethodNotFoundError('test'))).toBe(true);
        expect(isMethodNotFoundError(new ParseError())).toBe(false);
      });

      it('isInvalidParamsError', () => {
        expect(isInvalidParamsError(new InvalidParamsError())).toBe(true);
        expect(isInvalidParamsError(new ParseError())).toBe(false);
      });

      it('isInternalError', () => {
        expect(isInternalError(new InternalError())).toBe(true);
        expect(isInternalError(new ParseError())).toBe(false);
      });

      it('isToolExecutionError', () => {
        expect(isToolExecutionError(new ToolExecutionError('test', 'msg'))).toBe(
          true
        );
        expect(isToolExecutionError(new Error())).toBe(false);
        expect(isToolExecutionError(new McpError(-1, 'test'))).toBe(false);
      });
    });

    describe('error code helpers', () => {
      it('isServerErrorCode should identify server error range', () => {
        expect(isServerErrorCode(-32000)).toBe(true);
        expect(isServerErrorCode(-32050)).toBe(true);
        expect(isServerErrorCode(-32099)).toBe(true);
        expect(isServerErrorCode(-32100)).toBe(false);
        expect(isServerErrorCode(-31999)).toBe(false);
        expect(isServerErrorCode(-32700)).toBe(false);
      });

      it('isStandardErrorCode should identify standard codes', () => {
        expect(isStandardErrorCode(PARSE_ERROR)).toBe(true);
        expect(isStandardErrorCode(INVALID_REQUEST)).toBe(true);
        expect(isStandardErrorCode(METHOD_NOT_FOUND)).toBe(true);
        expect(isStandardErrorCode(INVALID_PARAMS)).toBe(true);
        expect(isStandardErrorCode(INTERNAL_ERROR)).toBe(true);
        expect(isStandardErrorCode(-32000)).toBe(false);
        expect(isStandardErrorCode(-32800)).toBe(false);
        expect(isStandardErrorCode(0)).toBe(false);
      });
    });
  });

  describe('Best Practices', () => {
    it('should never expose stack traces in error responses', () => {
      const error = new InternalError('Test');
      const response = toErrorResponse(error, 1);

      const responseStr = JSON.stringify(response);
      expect(responseStr).not.toContain('at ');
      expect(responseStr).not.toContain('.ts:');
      expect(responseStr).not.toContain('.js:');
    });

    it('should provide actionable error messages', () => {
      const methodError = new MethodNotFoundError('tools/unknown');
      expect(methodError.message).toContain('tools/unknown');
      expect(methodError.data).toHaveProperty('method');

      const paramsError = new InvalidParamsError('Field "name" is required');
      expect(paramsError.message).toContain('name');
    });

    it('should include relevant context in error data', () => {
      const error = new ContentTooLargeError(2000000, 1000000);
      expect(error.data).toEqual({
        actualSize: 2000000,
        maxSize: 1000000,
      });
    });
  });
});
