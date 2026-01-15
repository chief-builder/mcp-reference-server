/**
 * Argument auto-complete handler
 */
export interface CompletionRequest {
    ref: {
        type: 'ref/tool' | 'ref/prompt' | 'ref/resource';
        name: string;
    };
    argument: {
        name: string;
        value: string;
    };
}
export interface CompletionResult {
    values: string[];
    total?: number;
    hasMore?: boolean;
}
export type CompletionProvider = (request: CompletionRequest) => Promise<CompletionResult>;
export declare class CompletionHandler {
    private providers;
    registerProvider(refType: string, name: string, provider: CompletionProvider): void;
    complete(request: CompletionRequest): Promise<CompletionResult>;
}
//# sourceMappingURL=handler.d.ts.map