import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProgressReporter,
  extractProgressToken,
  createProgressNotification,
  createProgressReporter,
  PROGRESS_NOTIFICATION_METHOD,
  ProgressTokenSchema,
  ProgressNotificationParamsSchema,
} from '../../../src/protocol/progress.js';
import type { JsonRpcNotification } from '../../../src/protocol/jsonrpc.js';

describe('Progress Notifications', () => {
  describe('Constants', () => {
    it('should have correct notification method', () => {
      expect(PROGRESS_NOTIFICATION_METHOD).toBe('notifications/progress');
    });
  });

  describe('Schemas', () => {
    describe('ProgressTokenSchema', () => {
      it('should accept string tokens', () => {
        const result = ProgressTokenSchema.safeParse('token-123');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe('token-123');
        }
      });

      it('should accept number tokens', () => {
        const result = ProgressTokenSchema.safeParse(42);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(42);
        }
      });

      it('should reject non-string/number tokens', () => {
        expect(ProgressTokenSchema.safeParse(null).success).toBe(false);
        expect(ProgressTokenSchema.safeParse(undefined).success).toBe(false);
        expect(ProgressTokenSchema.safeParse({}).success).toBe(false);
        expect(ProgressTokenSchema.safeParse([]).success).toBe(false);
      });
    });

    describe('ProgressNotificationParamsSchema', () => {
      it('should accept minimal params', () => {
        const result = ProgressNotificationParamsSchema.safeParse({
          progressToken: 'token-1',
          progress: 50,
        });
        expect(result.success).toBe(true);
      });

      it('should accept full params', () => {
        const result = ProgressNotificationParamsSchema.safeParse({
          progressToken: 123,
          progress: 75,
          total: 100,
          message: 'Processing...',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.progressToken).toBe(123);
          expect(result.data.progress).toBe(75);
          expect(result.data.total).toBe(100);
          expect(result.data.message).toBe('Processing...');
        }
      });

      it('should reject missing progressToken', () => {
        const result = ProgressNotificationParamsSchema.safeParse({
          progress: 50,
        });
        expect(result.success).toBe(false);
      });

      it('should reject missing progress', () => {
        const result = ProgressNotificationParamsSchema.safeParse({
          progressToken: 'token',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('extractProgressToken', () => {
    it('should extract string token from _meta', () => {
      const params = {
        name: 'test',
        _meta: { progressToken: 'token-abc' },
      };
      expect(extractProgressToken(params)).toBe('token-abc');
    });

    it('should extract number token from _meta', () => {
      const params = {
        _meta: { progressToken: 999 },
      };
      expect(extractProgressToken(params)).toBe(999);
    });

    it('should return undefined for missing params', () => {
      expect(extractProgressToken(undefined)).toBeUndefined();
    });

    it('should return undefined for missing _meta', () => {
      const params = { name: 'test' };
      expect(extractProgressToken(params)).toBeUndefined();
    });

    it('should return undefined for missing progressToken', () => {
      const params = { _meta: {} };
      expect(extractProgressToken(params)).toBeUndefined();
    });

    it('should return undefined for null progressToken', () => {
      const params = { _meta: { progressToken: null } };
      expect(extractProgressToken(params)).toBeUndefined();
    });

    it('should return undefined for invalid progressToken type', () => {
      const params = { _meta: { progressToken: {} } };
      expect(extractProgressToken(params)).toBeUndefined();
    });

    it('should return undefined for non-object _meta', () => {
      const params = { _meta: 'string' };
      expect(extractProgressToken(params)).toBeUndefined();
    });

    it('should handle _meta with other fields', () => {
      const params = {
        _meta: {
          progressToken: 'my-token',
          otherField: 'value',
        },
      };
      expect(extractProgressToken(params)).toBe('my-token');
    });
  });

  describe('createProgressNotification', () => {
    it('should create notification with minimal params', () => {
      const notification = createProgressNotification('token-1', 50);
      expect(notification).toEqual({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressToken: 'token-1',
          progress: 50,
        },
      });
    });

    it('should create notification with total', () => {
      const notification = createProgressNotification('token-1', 50, 100);
      expect(notification.params).toEqual({
        progressToken: 'token-1',
        progress: 50,
        total: 100,
      });
    });

    it('should create notification with message', () => {
      const notification = createProgressNotification('token-1', 50, undefined, 'Processing...');
      expect(notification.params).toEqual({
        progressToken: 'token-1',
        progress: 50,
        message: 'Processing...',
      });
    });

    it('should create notification with all params', () => {
      const notification = createProgressNotification(42, 75, 100, 'Almost done');
      expect(notification.params).toEqual({
        progressToken: 42,
        progress: 75,
        total: 100,
        message: 'Almost done',
      });
    });
  });

  describe('ProgressReporter', () => {
    let sendNotification: ReturnType<typeof vi.fn>;
    let notifications: JsonRpcNotification[];

    beforeEach(() => {
      vi.useFakeTimers();
      notifications = [];
      sendNotification = vi.fn((notification: JsonRpcNotification) => {
        notifications.push(notification);
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('constructor', () => {
      it('should create reporter with string token', () => {
        const reporter = new ProgressReporter('token-1', sendNotification);
        reporter.report(50);
        expect(notifications[0].params?.['progressToken']).toBe('token-1');
      });

      it('should create reporter with number token', () => {
        const reporter = new ProgressReporter(123, sendNotification);
        reporter.report(50);
        expect(notifications[0].params?.['progressToken']).toBe(123);
      });

      it('should use default throttle interval', () => {
        const reporter = new ProgressReporter('token', sendNotification);
        reporter.report(10);
        reporter.report(20); // Should be throttled

        expect(notifications).toHaveLength(1);

        vi.advanceTimersByTime(100);
        reporter.report(30);

        expect(notifications).toHaveLength(2);
      });

      it('should use custom throttle interval', () => {
        const reporter = new ProgressReporter('token', sendNotification, { throttleMs: 50 });
        reporter.report(10);
        reporter.report(20); // Should be throttled

        expect(notifications).toHaveLength(1);

        vi.advanceTimersByTime(50);
        reporter.report(30);

        expect(notifications).toHaveLength(2);
      });
    });

    describe('report', () => {
      it('should emit immediately on first report', () => {
        const reporter = new ProgressReporter('token', sendNotification);
        reporter.report(50);

        expect(notifications).toHaveLength(1);
        expect(notifications[0].params?.['progress']).toBe(50);
      });

      it('should throttle rapid reports', () => {
        const reporter = new ProgressReporter('token', sendNotification);

        reporter.report(10);
        reporter.report(20);
        reporter.report(30);
        reporter.report(40);

        // Only first should be emitted
        expect(notifications).toHaveLength(1);
        expect(notifications[0].params?.['progress']).toBe(10);
      });

      it('should emit after throttle interval', () => {
        const reporter = new ProgressReporter('token', sendNotification, { throttleMs: 100 });

        reporter.report(10);
        vi.advanceTimersByTime(100);
        reporter.report(50);

        expect(notifications).toHaveLength(2);
        expect(notifications[1].params?.['progress']).toBe(50);
      });

      it('should include total when provided', () => {
        const reporter = new ProgressReporter('token', sendNotification);
        reporter.report(25, 100);

        expect(notifications[0].params?.['total']).toBe(100);
      });

      it('should include message when provided', () => {
        const reporter = new ProgressReporter('token', sendNotification);
        reporter.report(25, 100, 'Processing item 1');

        expect(notifications[0].params?.['message']).toBe('Processing item 1');
      });

      it('should not emit after complete', () => {
        const reporter = new ProgressReporter('token', sendNotification);
        reporter.report(50);
        reporter.complete();
        reporter.report(75); // Should be ignored

        expect(notifications).toHaveLength(1);
      });
    });

    describe('complete', () => {
      it('should emit pending progress immediately', () => {
        const reporter = new ProgressReporter('token', sendNotification);

        reporter.report(10);
        reporter.report(50); // Throttled, becomes pending
        reporter.complete();

        expect(notifications).toHaveLength(2);
        expect(notifications[1].params?.['progress']).toBe(50);
      });

      it('should override pending message with completion message', () => {
        const reporter = new ProgressReporter('token', sendNotification);

        reporter.report(10);
        reporter.report(50, 100, 'In progress'); // Throttled
        reporter.complete('Done!');

        expect(notifications).toHaveLength(2);
        expect(notifications[1].params?.['progress']).toBe(50);
        expect(notifications[1].params?.['total']).toBe(100);
        expect(notifications[1].params?.['message']).toBe('Done!');
      });

      it('should emit default completion when message provided but no pending', () => {
        const reporter = new ProgressReporter('token', sendNotification);
        reporter.report(50);

        vi.advanceTimersByTime(200); // Clear any pending
        reporter.complete('All done');

        expect(notifications).toHaveLength(2);
        expect(notifications[1].params?.['progress']).toBe(100);
        expect(notifications[1].params?.['total']).toBe(100);
        expect(notifications[1].params?.['message']).toBe('All done');
      });

      it('should not emit if no pending and no message', () => {
        const reporter = new ProgressReporter('token', sendNotification);
        reporter.report(50);

        vi.advanceTimersByTime(200); // Clear any pending
        reporter.complete();

        expect(notifications).toHaveLength(1);
      });

      it('should only complete once', () => {
        const reporter = new ProgressReporter('token', sendNotification);
        reporter.report(10);
        reporter.report(50); // Pending
        reporter.complete('First');
        reporter.complete('Second'); // Should be ignored

        expect(notifications).toHaveLength(2);
        expect(notifications[1].params?.['message']).toBe('First');
      });

      it('should bypass throttle on complete', () => {
        const reporter = new ProgressReporter('token', sendNotification, { throttleMs: 1000 });

        reporter.report(10);
        reporter.report(99); // Immediately throttled
        reporter.complete(); // Should emit pending immediately

        expect(notifications).toHaveLength(2);
        expect(notifications[1].params?.['progress']).toBe(99);
      });
    });

    describe('throttling behavior', () => {
      it('should keep only latest pending values', () => {
        const reporter = new ProgressReporter('token', sendNotification);

        reporter.report(10);
        reporter.report(20, 100, 'msg1');
        reporter.report(30, 200, 'msg2');
        reporter.report(40); // Latest, no total/message

        vi.advanceTimersByTime(100);
        reporter.report(50); // This triggers emit of pending (40)

        expect(notifications).toHaveLength(2);
        expect(notifications[1].params?.['progress']).toBe(50);
      });

      it('should work with zero throttle', () => {
        const reporter = new ProgressReporter('token', sendNotification, { throttleMs: 0 });

        reporter.report(10);
        reporter.report(20);
        reporter.report(30);

        expect(notifications).toHaveLength(3);
      });

      it('should handle edge case at exact throttle boundary', () => {
        const reporter = new ProgressReporter('token', sendNotification, { throttleMs: 100 });

        reporter.report(10);
        vi.advanceTimersByTime(100);
        reporter.report(20);

        expect(notifications).toHaveLength(2);
      });
    });
  });

  describe('createProgressReporter', () => {
    let sendNotification: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      sendNotification = vi.fn();
    });

    it('should return reporter when token present', () => {
      const params = { _meta: { progressToken: 'token-123' } };
      const reporter = createProgressReporter(params, sendNotification);

      expect(reporter).toBeInstanceOf(ProgressReporter);
    });

    it('should return undefined when no token', () => {
      const params = { name: 'test' };
      const reporter = createProgressReporter(params, sendNotification);

      expect(reporter).toBeUndefined();
    });

    it('should return undefined for undefined params', () => {
      const reporter = createProgressReporter(undefined, sendNotification);

      expect(reporter).toBeUndefined();
    });

    it('should pass options to reporter', () => {
      vi.useFakeTimers();
      const params = { _meta: { progressToken: 'token' } };
      const reporter = createProgressReporter(params, sendNotification, { throttleMs: 50 });

      reporter!.report(10);
      reporter!.report(20); // Throttled

      expect(sendNotification).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      reporter!.report(30);

      expect(sendNotification).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('should work with number token', () => {
      const params = { _meta: { progressToken: 42 } };
      const reporter = createProgressReporter(params, sendNotification);

      expect(reporter).toBeInstanceOf(ProgressReporter);

      reporter!.report(50);
      expect(sendNotification).toHaveBeenCalled();

      const notification = sendNotification.mock.calls[0][0] as JsonRpcNotification;
      expect(notification.params?.['progressToken']).toBe(42);
    });
  });
});
