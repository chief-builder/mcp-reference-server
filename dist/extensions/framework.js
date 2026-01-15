/**
 * Extension negotiation framework
 */
export class ExtensionFramework {
    extensions = new Map();
    enabledExtensions = new Set();
    register(extension) {
        this.extensions.set(extension.name, extension);
    }
    async negotiate(request) {
        const enabled = [];
        for (const requested of request.extensions) {
            const extension = this.extensions.get(requested.name);
            if (extension && this.isVersionCompatible(extension.version, requested.version)) {
                enabled.push({
                    name: extension.name,
                    version: extension.version,
                });
                this.enabledExtensions.add(extension.name);
                await extension.initialize?.();
            }
        }
        return { enabled };
    }
    isEnabled(name) {
        return this.enabledExtensions.has(name);
    }
    isVersionCompatible(_serverVersion, _clientVersion) {
        // TODO: Implement semver compatibility check
        return true;
    }
    async shutdown() {
        for (const name of this.enabledExtensions) {
            const extension = this.extensions.get(name);
            await extension?.shutdown?.();
        }
        this.enabledExtensions.clear();
    }
}
//# sourceMappingURL=framework.js.map