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

export class ExtensionFramework {
  private extensions: Map<string, Extension> = new Map();
  private enabledExtensions: Set<string> = new Set();

  register(extension: Extension): void {
    this.extensions.set(extension.name, extension);
  }

  async negotiate(request: ExtensionNegotiationRequest): Promise<ExtensionNegotiationResult> {
    const enabled: Array<{ name: string; version: string }> = [];

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

  isEnabled(name: string): boolean {
    return this.enabledExtensions.has(name);
  }

  private isVersionCompatible(_serverVersion: string, _clientVersion: string): boolean {
    // TODO: Implement semver compatibility check
    return true;
  }

  async shutdown(): Promise<void> {
    for (const name of this.enabledExtensions) {
      const extension = this.extensions.get(name);
      await extension?.shutdown?.();
    }
    this.enabledExtensions.clear();
  }
}
