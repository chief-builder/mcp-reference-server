/**
 * Extension negotiation framework
 */
export interface Extension {
    name: string;
    version: string;
    initialize?: () => Promise<void>;
    shutdown?: () => Promise<void>;
}
export interface ExtensionNegotiationRequest {
    extensions: Array<{
        name: string;
        version: string;
    }>;
}
export interface ExtensionNegotiationResult {
    enabled: Array<{
        name: string;
        version: string;
    }>;
}
export declare class ExtensionFramework {
    private extensions;
    private enabledExtensions;
    register(extension: Extension): void;
    negotiate(request: ExtensionNegotiationRequest): Promise<ExtensionNegotiationResult>;
    isEnabled(name: string): boolean;
    private isVersionCompatible;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=framework.d.ts.map