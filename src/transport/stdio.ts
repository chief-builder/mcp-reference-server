/**
 * stdio transport implementation
 */

export interface StdioTransportOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export class StdioTransport {
  constructor(_options?: StdioTransportOptions) {
    // TODO: Implement stdio transport
  }

  async start(): Promise<void> {
    // TODO: Implement start
  }

  async stop(): Promise<void> {
    // TODO: Implement stop
  }
}
