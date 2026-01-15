import { describe, it, expect } from 'vitest';
import {
  JSONRPC_VERSION,
  JsonRpcErrorCodes,
  parseJsonRpc,
  parseJsonRpcResponse,
  serializeJsonRpc,
  serializeRequest,
  serializeNotification,
  serializeMessage,
  createRequest,
  createNotification,
  createSuccessResponse,
  createErrorResponse,
  createJsonRpcError,
  createParseErrorResponse,
  createInvalidRequestResponse,
  createMethodNotFoundResponse,
  createInvalidParamsResponse,
  createInternalErrorResponse,
  createIdGenerator,
  createNumericIdGenerator,
  isRequest,
  isNotification,
  isResponse,
  isSuccessResponse,
  isErrorResponse,
  JsonRpcRequestSchema,
  JsonRpcNotificationSchema,
  JsonRpcResponseSchema,
} from '../../../src/protocol/jsonrpc.js';

describe('JSON-RPC 2.0', () => {
  describe('Constants', () => {
    it('should have correct JSONRPC_VERSION', () => {
      expect(JSONRPC_VERSION).toBe('2.0');
    });

    it('should have standard error codes', () => {
      expect(JsonRpcErrorCodes.PARSE_ERROR).toBe(-32700);
      expect(JsonRpcErrorCodes.INVALID_REQUEST).toBe(-32600);
      expect(JsonRpcErrorCodes.METHOD_NOT_FOUND).toBe(-32601);
      expect(JsonRpcErrorCodes.INVALID_PARAMS).toBe(-32602);
      expect(JsonRpcErrorCodes.INTERNAL_ERROR).toBe(-32603);
    });
  });

  describe('parseJsonRpc', () => {
    describe('valid requests', () => {
      it('should parse a simple request', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            jsonrpc: '2.0',
            id: 1,
            method: 'test',
          });
        }
      });

      it('should parse a request with params', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 'abc-123',
          method: 'tools/call',
          params: { name: 'calculator', args: { a: 1, b: 2 } },
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            jsonrpc: '2.0',
            id: 'abc-123',
            method: 'tools/call',
            params: { name: 'calculator', args: { a: 1, b: 2 } },
          });
        }
      });

      it('should parse a request with string id', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 'request-1',
          method: 'test',
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe('request-1');
        }
      });

      it('should parse a request with integer id', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 42,
          method: 'test',
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe(42);
        }
      });
    });

    describe('valid notifications', () => {
      it('should parse a simple notification', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/cancelled',
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            jsonrpc: '2.0',
            method: 'notifications/cancelled',
          });
          expect('id' in result.data).toBe(false);
        }
      });

      it('should parse a notification with params', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: { progress: 50, total: 100 },
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            jsonrpc: '2.0',
            method: 'notifications/progress',
            params: { progress: 50, total: 100 },
          });
        }
      });
    });

    describe('invalid JSON', () => {
      it('should return parse error for invalid JSON', () => {
        const result = parseJsonRpc('not valid json');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.PARSE_ERROR);
        }
      });

      it('should return parse error for incomplete JSON', () => {
        const result = parseJsonRpc('{"jsonrpc": "2.0"');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.PARSE_ERROR);
        }
      });
    });

    describe('invalid requests', () => {
      it('should reject non-object JSON', () => {
        const result = parseJsonRpc('"string"');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
        }
      });

      it('should reject array JSON', () => {
        const result = parseJsonRpc('[]');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
        }
      });

      it('should reject null JSON', () => {
        const result = parseJsonRpc('null');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
        }
      });

      it('should reject wrong jsonrpc version', () => {
        const input = JSON.stringify({
          jsonrpc: '1.0',
          id: 1,
          method: 'test',
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
          expect(result.error.message).toContain('jsonrpc must be "2.0"');
        }
      });

      it('should reject missing jsonrpc version', () => {
        const input = JSON.stringify({
          id: 1,
          method: 'test',
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
        }
      });

      it('should reject missing method', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
          expect(result.error.message).toContain('method');
        }
      });

      it('should reject non-string method', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 123,
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
        }
      });

      it('should reject fractional id', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1.5,
          method: 'test',
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
        }
      });

      it('should reject array params', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
          params: [1, 2, 3],
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS);
        }
      });

      it('should reject primitive params', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
          params: 'string',
        });
        const result = parseJsonRpc(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS);
        }
      });
    });
  });

  describe('parseJsonRpcResponse', () => {
    describe('valid success responses', () => {
      it('should parse a success response', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { data: 'test' },
        });
        const result = parseJsonRpcResponse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({
            jsonrpc: '2.0',
            id: 1,
            result: { data: 'test' },
          });
        }
      });

      it('should parse a response with null result', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: null,
        });
        const result = parseJsonRpcResponse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.result).toBe(null);
        }
      });

      it('should parse a response with null id', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          result: 'test',
        });
        const result = parseJsonRpcResponse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe(null);
        }
      });
    });

    describe('valid error responses', () => {
      it('should parse an error response', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32600,
            message: 'Invalid Request',
          },
        });
        const result = parseJsonRpcResponse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect('error' in result.data).toBe(true);
          if ('error' in result.data) {
            expect(result.data.error.code).toBe(-32600);
            expect(result.data.error.message).toBe('Invalid Request');
          }
        }
      });

      it('should parse an error response with data', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32602,
            message: 'Invalid params',
            data: { field: 'name', reason: 'required' },
          },
        });
        const result = parseJsonRpcResponse(input);
        expect(result.success).toBe(true);
        if (result.success && 'error' in result.data) {
          expect(result.data.error.data).toEqual({
            field: 'name',
            reason: 'required',
          });
        }
      });
    });

    describe('invalid responses', () => {
      it('should reject missing id', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          result: 'test',
        });
        const result = parseJsonRpcResponse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('id is required');
        }
      });

      it('should reject response with both result and error', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: 'test',
          error: { code: -32600, message: 'error' },
        });
        const result = parseJsonRpcResponse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('cannot have both');
        }
      });

      it('should reject response with neither result nor error', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
        });
        const result = parseJsonRpcResponse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('must have either');
        }
      });

      it('should reject malformed error object', () => {
        const input = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: 'not a number', message: 'error' },
        });
        const result = parseJsonRpcResponse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('malformed');
        }
      });
    });
  });

  describe('Factory Functions', () => {
    describe('createRequest', () => {
      it('should create a request without params', () => {
        const request = createRequest(1, 'test');
        expect(request).toEqual({
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
        });
      });

      it('should create a request with params', () => {
        const request = createRequest('req-1', 'tools/call', { name: 'calc' });
        expect(request).toEqual({
          jsonrpc: '2.0',
          id: 'req-1',
          method: 'tools/call',
          params: { name: 'calc' },
        });
      });
    });

    describe('createNotification', () => {
      it('should create a notification without params', () => {
        const notification = createNotification('notifications/cancelled');
        expect(notification).toEqual({
          jsonrpc: '2.0',
          method: 'notifications/cancelled',
        });
      });

      it('should create a notification with params', () => {
        const notification = createNotification('notifications/progress', {
          progress: 50,
        });
        expect(notification).toEqual({
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: { progress: 50 },
        });
      });
    });

    describe('createSuccessResponse', () => {
      it('should create a success response', () => {
        const response = createSuccessResponse(1, { data: 'test' });
        expect(response).toEqual({
          jsonrpc: '2.0',
          id: 1,
          result: { data: 'test' },
        });
      });
    });

    describe('createErrorResponse', () => {
      it('should create an error response', () => {
        const error = createJsonRpcError(-32600, 'Invalid Request');
        const response = createErrorResponse(1, error);
        expect(response).toEqual({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32600, message: 'Invalid Request' },
        });
      });
    });

    describe('error response helpers', () => {
      it('should create parse error response', () => {
        const response = createParseErrorResponse('details');
        expect(response.id).toBe(null);
        expect(response.error.code).toBe(JsonRpcErrorCodes.PARSE_ERROR);
        expect(response.error.data).toBe('details');
      });

      it('should create invalid request response', () => {
        const response = createInvalidRequestResponse(1);
        expect(response.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
      });

      it('should create method not found response', () => {
        const response = createMethodNotFoundResponse(1, 'unknown/method');
        expect(response.error.code).toBe(JsonRpcErrorCodes.METHOD_NOT_FOUND);
        expect(response.error.data).toEqual({ method: 'unknown/method' });
      });

      it('should create invalid params response', () => {
        const response = createInvalidParamsResponse(1);
        expect(response.error.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS);
      });

      it('should create internal error response', () => {
        const response = createInternalErrorResponse(1);
        expect(response.error.code).toBe(JsonRpcErrorCodes.INTERNAL_ERROR);
      });
    });
  });

  describe('Serialization', () => {
    it('should serialize response', () => {
      const response = createSuccessResponse(1, { result: 'ok' });
      const json = serializeJsonRpc(response);
      expect(JSON.parse(json)).toEqual(response);
    });

    it('should serialize request', () => {
      const request = createRequest(1, 'test', { foo: 'bar' });
      const json = serializeRequest(request);
      expect(JSON.parse(json)).toEqual(request);
    });

    it('should serialize notification', () => {
      const notification = createNotification('test', { foo: 'bar' });
      const json = serializeNotification(notification);
      expect(JSON.parse(json)).toEqual(notification);
    });

    it('should serialize any message', () => {
      const request = createRequest(1, 'test');
      const json = serializeMessage(request);
      expect(JSON.parse(json)).toEqual(request);
    });
  });

  describe('ID Generators', () => {
    describe('createIdGenerator', () => {
      it('should generate unique string IDs', () => {
        const gen = createIdGenerator();
        const ids = [gen(), gen(), gen()];
        expect(new Set(ids).size).toBe(3);
      });

      it('should use custom prefix', () => {
        const gen = createIdGenerator('custom');
        const id = gen();
        expect(id).toMatch(/^custom-\d+$/);
      });

      it('should increment counter', () => {
        const gen = createIdGenerator('test');
        expect(gen()).toBe('test-1');
        expect(gen()).toBe('test-2');
        expect(gen()).toBe('test-3');
      });
    });

    describe('createNumericIdGenerator', () => {
      it('should generate sequential numeric IDs', () => {
        const gen = createNumericIdGenerator();
        expect(gen()).toBe(1);
        expect(gen()).toBe(2);
        expect(gen()).toBe(3);
      });

      it('should be independent per generator', () => {
        const gen1 = createNumericIdGenerator();
        const gen2 = createNumericIdGenerator();
        expect(gen1()).toBe(1);
        expect(gen2()).toBe(1);
        expect(gen1()).toBe(2);
        expect(gen2()).toBe(2);
      });
    });
  });

  describe('Type Guards', () => {
    describe('isRequest', () => {
      it('should identify request messages', () => {
        const request = createRequest(1, 'test');
        expect(isRequest(request)).toBe(true);
      });

      it('should not identify notifications as requests', () => {
        const notification = createNotification('test');
        expect(isRequest(notification)).toBe(false);
      });

      it('should not identify responses as requests', () => {
        const response = createSuccessResponse(1, 'result');
        expect(isRequest(response)).toBe(false);
      });
    });

    describe('isNotification', () => {
      it('should identify notification messages', () => {
        const notification = createNotification('test');
        expect(isNotification(notification)).toBe(true);
      });

      it('should not identify requests as notifications', () => {
        const request = createRequest(1, 'test');
        expect(isNotification(request)).toBe(false);
      });
    });

    describe('isResponse', () => {
      it('should identify success responses', () => {
        const response = createSuccessResponse(1, 'result');
        expect(isResponse(response)).toBe(true);
      });

      it('should identify error responses', () => {
        const response = createErrorResponse(
          1,
          createJsonRpcError(-32600, 'error')
        );
        expect(isResponse(response)).toBe(true);
      });

      it('should not identify requests as responses', () => {
        const request = createRequest(1, 'test');
        expect(isResponse(request)).toBe(false);
      });
    });

    describe('isSuccessResponse / isErrorResponse', () => {
      it('should identify success response', () => {
        const response = createSuccessResponse(1, 'result');
        expect(isSuccessResponse(response)).toBe(true);
        expect(isErrorResponse(response)).toBe(false);
      });

      it('should identify error response', () => {
        const response = createErrorResponse(
          1,
          createJsonRpcError(-32600, 'error')
        );
        expect(isSuccessResponse(response)).toBe(false);
        expect(isErrorResponse(response)).toBe(true);
      });
    });
  });

  describe('Zod Schemas', () => {
    it('should validate request schema', () => {
      const result = JsonRpcRequestSchema.safeParse({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid request schema', () => {
      const result = JsonRpcRequestSchema.safeParse({
        jsonrpc: '2.0',
        method: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('should validate notification schema', () => {
      const result = JsonRpcNotificationSchema.safeParse({
        jsonrpc: '2.0',
        method: 'test',
      });
      expect(result.success).toBe(true);
    });

    it('should reject notification with id', () => {
      const result = JsonRpcNotificationSchema.safeParse({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('should validate response schema', () => {
      const result = JsonRpcResponseSchema.safeParse({
        jsonrpc: '2.0',
        id: 1,
        result: 'test',
      });
      expect(result.success).toBe(true);
    });
  });
});
