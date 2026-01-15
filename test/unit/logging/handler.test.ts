import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LoggingHandler,
  LOG_LEVEL_PRIORITY,
  LogLevelSchema,
  SetLevelParamsSchema,
  LogMessageParamsSchema,
  type LogLevel,
  type NotificationSender,
} from '../../../src/logging/handler.js';
import { JSONRPC_VERSION } from '../../../src/protocol/jsonrpc.js';

describe('LoggingHandler', () => {
  describe('RFC 5424 Log Level Priorities', () => {
    it('should have correct RFC 5424 priority values', () => {
      // RFC 5424 defines: emergency=0 (most severe) to debug=7 (least severe)
      expect(LOG_LEVEL_PRIORITY.emergency).toBe(0);
      expect(LOG_LEVEL_PRIORITY.alert).toBe(1);
      expect(LOG_LEVEL_PRIORITY.critical).toBe(2);
      expect(LOG_LEVEL_PRIORITY.error).toBe(3);
      expect(LOG_LEVEL_PRIORITY.warning).toBe(4);
      expect(LOG_LEVEL_PRIORITY.notice).toBe(5);
      expect(LOG_LEVEL_PRIORITY.info).toBe(6);
      expect(LOG_LEVEL_PRIORITY.debug).toBe(7);
    });

    it('should have lower numbers for more severe levels', () => {
      expect(LOG_LEVEL_PRIORITY.emergency).toBeLessThan(LOG_LEVEL_PRIORITY.alert);
      expect(LOG_LEVEL_PRIORITY.alert).toBeLessThan(LOG_LEVEL_PRIORITY.critical);
      expect(LOG_LEVEL_PRIORITY.critical).toBeLessThan(LOG_LEVEL_PRIORITY.error);
      expect(LOG_LEVEL_PRIORITY.error).toBeLessThan(LOG_LEVEL_PRIORITY.warning);
      expect(LOG_LEVEL_PRIORITY.warning).toBeLessThan(LOG_LEVEL_PRIORITY.notice);
      expect(LOG_LEVEL_PRIORITY.notice).toBeLessThan(LOG_LEVEL_PRIORITY.info);
      expect(LOG_LEVEL_PRIORITY.info).toBeLessThan(LOG_LEVEL_PRIORITY.debug);
    });
  });

  describe('Zod Schemas', () => {
    describe('LogLevelSchema', () => {
      it('should accept all valid log levels', () => {
        const levels: LogLevel[] = [
          'debug',
          'info',
          'notice',
          'warning',
          'error',
          'critical',
          'alert',
          'emergency',
        ];

        for (const level of levels) {
          expect(LogLevelSchema.safeParse(level).success).toBe(true);
        }
      });

      it('should reject invalid log levels', () => {
        expect(LogLevelSchema.safeParse('trace').success).toBe(false);
        expect(LogLevelSchema.safeParse('fatal').success).toBe(false);
        expect(LogLevelSchema.safeParse('').success).toBe(false);
        expect(LogLevelSchema.safeParse(123).success).toBe(false);
      });
    });

    describe('SetLevelParamsSchema', () => {
      it('should validate correct params', () => {
        const result = SetLevelParamsSchema.safeParse({ level: 'debug' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.level).toBe('debug');
        }
      });

      it('should reject missing level', () => {
        expect(SetLevelParamsSchema.safeParse({}).success).toBe(false);
      });

      it('should reject invalid level', () => {
        expect(SetLevelParamsSchema.safeParse({ level: 'invalid' }).success).toBe(false);
      });
    });

    describe('LogMessageParamsSchema', () => {
      it('should validate minimal params', () => {
        const result = LogMessageParamsSchema.safeParse({
          level: 'info',
          message: 'test message',
        });
        expect(result.success).toBe(true);
      });

      it('should validate params with all fields', () => {
        const result = LogMessageParamsSchema.safeParse({
          level: 'error',
          message: 'Something went wrong',
          logger: 'myapp',
          data: { code: 500 },
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.level).toBe('error');
          expect(result.data.message).toBe('Something went wrong');
          expect(result.data.logger).toBe('myapp');
          expect(result.data.data).toEqual({ code: 500 });
        }
      });

      it('should reject missing required fields', () => {
        expect(LogMessageParamsSchema.safeParse({ level: 'info' }).success).toBe(false);
        expect(LogMessageParamsSchema.safeParse({ message: 'test' }).success).toBe(false);
      });
    });
  });

  describe('Constructor', () => {
    it('should use default level of info', () => {
      const handler = new LoggingHandler();
      expect(handler.getLevel()).toBe('info');
    });

    it('should accept custom initial level', () => {
      const handler = new LoggingHandler({ minLevel: 'debug' });
      expect(handler.getLevel()).toBe('debug');
    });

    it('should accept notification sender', () => {
      const sender = vi.fn();
      const handler = new LoggingHandler({ notificationSender: sender });
      handler.log('info', 'test');
      expect(sender).toHaveBeenCalled();
    });
  });

  describe('getLevel', () => {
    it('should return current log level', () => {
      const handler = new LoggingHandler({ minLevel: 'warning' });
      expect(handler.getLevel()).toBe('warning');
    });
  });

  describe('setLevel', () => {
    it('should update the log level', () => {
      const handler = new LoggingHandler();
      handler.setLevel('debug');
      expect(handler.getLevel()).toBe('debug');
    });

    it('should accept all valid levels', () => {
      const handler = new LoggingHandler();
      const levels: LogLevel[] = [
        'debug',
        'info',
        'notice',
        'warning',
        'error',
        'critical',
        'alert',
        'emergency',
      ];

      for (const level of levels) {
        handler.setLevel(level);
        expect(handler.getLevel()).toBe(level);
      }
    });

    it('should ignore invalid levels', () => {
      const handler = new LoggingHandler({ minLevel: 'info' });
      handler.setLevel('invalid' as LogLevel);
      expect(handler.getLevel()).toBe('info');
    });
  });

  describe('handleSetLevel', () => {
    it('should set level from valid params', () => {
      const handler = new LoggingHandler();
      const result = handler.handleSetLevel({ level: 'debug' });
      expect(result).toEqual({});
      expect(handler.getLevel()).toBe('debug');
    });

    it('should return empty object on success', () => {
      const handler = new LoggingHandler();
      const result = handler.handleSetLevel({ level: 'error' });
      expect(result).toEqual({});
    });

    it('should throw on invalid params', () => {
      const handler = new LoggingHandler();
      expect(() => handler.handleSetLevel({})).toThrow('Invalid params');
      expect(() => handler.handleSetLevel({ level: 'invalid' })).toThrow('Invalid params');
      expect(() => handler.handleSetLevel(null)).toThrow('Invalid params');
    });
  });

  describe('shouldLog', () => {
    it('should return true for messages at or above current level priority', () => {
      const handler = new LoggingHandler({ minLevel: 'warning' });

      // More severe (lower priority number) should be logged
      expect(handler.shouldLog('emergency')).toBe(true);
      expect(handler.shouldLog('alert')).toBe(true);
      expect(handler.shouldLog('critical')).toBe(true);
      expect(handler.shouldLog('error')).toBe(true);
      expect(handler.shouldLog('warning')).toBe(true);

      // Less severe (higher priority number) should NOT be logged
      expect(handler.shouldLog('notice')).toBe(false);
      expect(handler.shouldLog('info')).toBe(false);
      expect(handler.shouldLog('debug')).toBe(false);
    });

    it('should log everything when level is debug', () => {
      const handler = new LoggingHandler({ minLevel: 'debug' });

      expect(handler.shouldLog('emergency')).toBe(true);
      expect(handler.shouldLog('debug')).toBe(true);
    });

    it('should only log emergency when level is emergency', () => {
      const handler = new LoggingHandler({ minLevel: 'emergency' });

      expect(handler.shouldLog('emergency')).toBe(true);
      expect(handler.shouldLog('alert')).toBe(false);
      expect(handler.shouldLog('debug')).toBe(false);
    });
  });

  describe('log', () => {
    let sender: NotificationSender;
    let handler: LoggingHandler;

    beforeEach(() => {
      sender = vi.fn();
      handler = new LoggingHandler({
        minLevel: 'info',
        notificationSender: sender,
      });
    });

    it('should send notification for messages at current level', () => {
      handler.log('info', 'Test message');
      expect(sender).toHaveBeenCalledTimes(1);
    });

    it('should send notification for messages above current level priority', () => {
      handler.log('error', 'Error message');
      expect(sender).toHaveBeenCalledTimes(1);
    });

    it('should not send notification for messages below current level priority', () => {
      handler.log('debug', 'Debug message');
      expect(sender).not.toHaveBeenCalled();
    });

    it('should send correct notification format', () => {
      handler.log('warning', 'Warning message', { code: 123 }, 'mylogger');

      expect(sender).toHaveBeenCalledWith({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/message',
        params: {
          level: 'warning',
          message: 'Warning message',
          data: { code: 123 },
          logger: 'mylogger',
        },
      });
    });

    it('should omit optional fields when not provided', () => {
      handler.log('info', 'Simple message');

      expect(sender).toHaveBeenCalledWith({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/message',
        params: {
          level: 'info',
          message: 'Simple message',
        },
      });
    });

    it('should include logger when provided', () => {
      handler.log('info', 'Message', undefined, 'server');

      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.logger).toBe('server');
      expect(call.params.data).toBeUndefined();
    });

    it('should include data when provided', () => {
      handler.log('info', 'Message', { key: 'value' });

      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.data).toEqual({ key: 'value' });
      expect(call.params.logger).toBeUndefined();
    });

    it('should handle undefined sender gracefully', () => {
      const handlerNoSender = new LoggingHandler({ minLevel: 'info' });
      // Should not throw
      expect(() => handlerNoSender.log('info', 'Test')).not.toThrow();
    });
  });

  describe('setNotificationSender', () => {
    it('should update the notification sender', () => {
      const handler = new LoggingHandler({ minLevel: 'info' });
      const sender = vi.fn();

      handler.setNotificationSender(sender);
      handler.log('info', 'Test');

      expect(sender).toHaveBeenCalled();
    });

    it('should replace existing sender', () => {
      const oldSender = vi.fn();
      const newSender = vi.fn();

      const handler = new LoggingHandler({
        minLevel: 'info',
        notificationSender: oldSender,
      });

      handler.setNotificationSender(newSender);
      handler.log('info', 'Test');

      expect(oldSender).not.toHaveBeenCalled();
      expect(newSender).toHaveBeenCalled();
    });
  });

  describe('Convenience Methods', () => {
    let sender: NotificationSender;
    let handler: LoggingHandler;

    beforeEach(() => {
      sender = vi.fn();
      handler = new LoggingHandler({
        minLevel: 'debug',
        notificationSender: sender,
      });
    });

    it('debug() should log at debug level', () => {
      handler.debug('Debug message');
      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.level).toBe('debug');
    });

    it('info() should log at info level', () => {
      handler.info('Info message');
      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.level).toBe('info');
    });

    it('notice() should log at notice level', () => {
      handler.notice('Notice message');
      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.level).toBe('notice');
    });

    it('warning() should log at warning level', () => {
      handler.warning('Warning message');
      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.level).toBe('warning');
    });

    it('error() should log at error level', () => {
      handler.error('Error message');
      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.level).toBe('error');
    });

    it('critical() should log at critical level', () => {
      handler.critical('Critical message');
      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.level).toBe('critical');
    });

    it('alert() should log at alert level', () => {
      handler.alert('Alert message');
      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.level).toBe('alert');
    });

    it('emergency() should log at emergency level', () => {
      handler.emergency('Emergency message');
      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.level).toBe('emergency');
    });

    it('convenience methods should pass data and logger', () => {
      handler.info('Test', { key: 'value' }, 'mylogger');
      const call = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.params.data).toEqual({ key: 'value' });
      expect(call.params.logger).toBe('mylogger');
    });
  });

  describe('Level Filtering (RFC 5424 Compliance)', () => {
    it('should filter based on RFC 5424 priority ordering', () => {
      const sender = vi.fn();
      const handler = new LoggingHandler({
        minLevel: 'error',
        notificationSender: sender,
      });

      // Should log (priority <= error priority)
      handler.log('emergency', 'Emergency');
      handler.log('alert', 'Alert');
      handler.log('critical', 'Critical');
      handler.log('error', 'Error');

      // Should NOT log (priority > error priority)
      handler.log('warning', 'Warning');
      handler.log('notice', 'Notice');
      handler.log('info', 'Info');
      handler.log('debug', 'Debug');

      expect(sender).toHaveBeenCalledTimes(4);
    });

    it('should update filtering when level changes', () => {
      const sender = vi.fn();
      const handler = new LoggingHandler({
        minLevel: 'error',
        notificationSender: sender,
      });

      handler.log('info', 'Should not log');
      expect(sender).toHaveBeenCalledTimes(0);

      handler.setLevel('info');
      handler.log('info', 'Should log now');
      expect(sender).toHaveBeenCalledTimes(1);
    });
  });

  describe('Notification Format', () => {
    it('should use notifications/message as method', () => {
      const sender = vi.fn();
      const handler = new LoggingHandler({
        minLevel: 'info',
        notificationSender: sender,
      });

      handler.log('info', 'Test');

      const notification = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(notification.method).toBe('notifications/message');
    });

    it('should use JSON-RPC 2.0 format', () => {
      const sender = vi.fn();
      const handler = new LoggingHandler({
        minLevel: 'info',
        notificationSender: sender,
      });

      handler.log('info', 'Test');

      const notification = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(notification.jsonrpc).toBe('2.0');
      expect(notification).not.toHaveProperty('id'); // Notifications have no id
    });

    it('should include all message fields in params', () => {
      const sender = vi.fn();
      const handler = new LoggingHandler({
        minLevel: 'info',
        notificationSender: sender,
      });

      handler.log('error', 'Error occurred', { stack: 'trace' }, 'errorHandler');

      const notification = (sender as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(notification.params).toEqual({
        level: 'error',
        message: 'Error occurred',
        data: { stack: 'trace' },
        logger: 'errorHandler',
      });
    });
  });
});
