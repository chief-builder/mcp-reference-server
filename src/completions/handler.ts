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

export type CompletionProvider = (
  request: CompletionRequest
) => Promise<CompletionResult>;

export class CompletionHandler {
  private providers: Map<string, CompletionProvider> = new Map();

  registerProvider(refType: string, name: string, provider: CompletionProvider): void {
    const key = `${refType}:${name}`;
    this.providers.set(key, provider);
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const key = `${request.ref.type}:${request.ref.name}`;
    const provider = this.providers.get(key);

    if (!provider) {
      return { values: [] };
    }

    return provider(request);
  }
}
