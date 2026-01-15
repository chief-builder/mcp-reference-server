/**
 * Log level management and logging handler
 */
export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
export interface LogMessage {
    level: LogLevel;
    logger?: string;
    data?: unknown;
}
export interface LoggingHandlerOptions {
    minLevel?: LogLevel;
    onLog?: (message: LogMessage) => void;
}
export declare class LoggingHandler {
    private minLevel;
    private onLog;
    constructor(options?: LoggingHandlerOptions);
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    log(message: LogMessage): void;
    shouldLog(level: LogLevel): boolean;
}
//# sourceMappingURL=handler.d.ts.map