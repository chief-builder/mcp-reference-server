/**
 * Log level management and logging handler
 */
const LOG_LEVEL_ORDER = {
    debug: 0,
    info: 1,
    notice: 2,
    warning: 3,
    error: 4,
    critical: 5,
    alert: 6,
    emergency: 7,
};
export class LoggingHandler {
    minLevel;
    onLog;
    constructor(options = {}) {
        this.minLevel = options.minLevel ?? 'info';
        this.onLog = options.onLog;
    }
    setLevel(level) {
        this.minLevel = level;
    }
    getLevel() {
        return this.minLevel;
    }
    log(message) {
        if (LOG_LEVEL_ORDER[message.level] >= LOG_LEVEL_ORDER[this.minLevel]) {
            this.onLog?.(message);
        }
    }
    shouldLog(level) {
        return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.minLevel];
    }
}
//# sourceMappingURL=handler.js.map