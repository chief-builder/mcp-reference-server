/**
 * Streamable HTTP transport implementation
 */

import type { Express } from 'express';

export interface HttpTransportOptions {
  port?: number;
  host?: string;
  app?: Express;
}

export class HttpTransport {
  constructor(_options?: HttpTransportOptions) {
    // TODO: Implement HTTP transport
  }

  async start(): Promise<void> {
    // TODO: Implement start
  }

  async stop(): Promise<void> {
    // TODO: Implement stop
  }
}
