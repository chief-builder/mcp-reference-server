/**
 * Tool execution with validation
 */
export class ToolExecutor {
    options;
    constructor(options = {}) {
        this.options = options;
    }
    async execute(tool, input) {
        const startTime = performance.now();
        try {
            // Validate input if enabled
            if (this.options.validateInput !== false) {
                const parseResult = tool.inputSchema.safeParse(input);
                if (!parseResult.success) {
                    return {
                        success: false,
                        error: {
                            code: 'INVALID_INPUT',
                            message: 'Input validation failed',
                            details: parseResult.error.issues,
                        },
                        durationMs: performance.now() - startTime,
                    };
                }
                input = parseResult.data;
            }
            // Execute with timeout
            const result = await this.executeWithTimeout(tool, input);
            return {
                success: true,
                result,
                durationMs: performance.now() - startTime,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'EXECUTION_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error',
                },
                durationMs: performance.now() - startTime,
            };
        }
    }
    async executeWithTimeout(tool, input) {
        const timeoutMs = this.options.timeoutMs ?? 30000;
        return Promise.race([
            tool.handler(input),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)),
        ]);
    }
}
//# sourceMappingURL=executor.js.map