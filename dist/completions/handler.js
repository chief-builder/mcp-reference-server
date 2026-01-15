/**
 * Argument auto-complete handler
 */
export class CompletionHandler {
    providers = new Map();
    registerProvider(refType, name, provider) {
        const key = `${refType}:${name}`;
        this.providers.set(key, provider);
    }
    async complete(request) {
        const key = `${request.ref.type}:${request.ref.name}`;
        const provider = this.providers.get(key);
        if (!provider) {
            return { values: [] };
        }
        return provider(request);
    }
}
//# sourceMappingURL=handler.js.map