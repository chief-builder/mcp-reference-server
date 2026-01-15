/**
 * OpenTelemetry setup
 */

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  enabled?: boolean;
  endpoint?: string;
}

export class TelemetryManager {
  private initialized = false;

  constructor(private readonly config: TelemetryConfig) {}

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (this.initialized) {
      return;
    }

    // TODO: Initialize OpenTelemetry SDK
    // - NodeSDK setup
    // - Resource configuration
    // - Exporter configuration

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // TODO: Shutdown OpenTelemetry SDK

    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
