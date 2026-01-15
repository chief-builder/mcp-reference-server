/**
 * Log level management and logging handler
 */

export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  error: 4,
  critical: 5,
  alert: 6,
  emergency: 7,
};

export interface LogMessage {
  level: LogLevel;
  logger?: string;
  data?: unknown;
}

export interface LoggingHandlerOptions {
  minLevel?: LogLevel;
  onLog?: (message: LogMessage) => void;
}

export class LoggingHandler {
  private minLevel: LogLevel;
  private onLog: ((message: LogMessage) => void) | undefined;

  constructor(options: LoggingHandlerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.onLog = options.onLog;
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  getLevel(): LogLevel {
    return this.minLevel;
  }

  log(message: LogMessage): void {
    if (LOG_LEVEL_ORDER[message.level] >= LOG_LEVEL_ORDER[this.minLevel]) {
      this.onLog?.(message);
    }
  }

  shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.minLevel];
  }
}
