/**
 * Server Harness for E2E Tests
 *
 * Spawns and manages server processes for end-to-end testing.
 * Handles process lifecycle including startup, health checking, and graceful shutdown.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

export interface ServerHarnessOptions {
  /** Port for HTTP transport (required for HTTP mode) */
  port?: number;
  /** Host to bind to (default: 127.0.0.1) */
  host?: string;
  /** Transport mode: 'stdio' | 'http' | 'both' */
  transport?: 'stdio' | 'http' | 'both';
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Timeout for server startup in milliseconds (default: 10000) */
  startupTimeout?: number;
  /** Enable stateless mode for HTTP */
  statelessMode?: boolean;
}

export interface ServerInfo {
  port: number;
  pid: number;
}

export class ServerHarness {
  private process: ChildProcess | null = null;
  private options: Required<Omit<ServerHarnessOptions, 'env' | 'port'>> & {
    port?: number;
    env?: Record<string, string>;
  };
  private projectRoot: string;

  constructor(options: ServerHarnessOptions = {}) {
    this.projectRoot = resolve(import.meta.dirname, '../../..');
    this.options = {
      host: options.host ?? '127.0.0.1',
      transport: options.transport ?? 'http',
      startupTimeout: options.startupTimeout ?? 10000,
      statelessMode: options.statelessMode ?? false,
      port: options.port,
      env: options.env,
    };
  }

  /**
   * Start the server process and wait for it to be ready.
   * Returns server info including port and PID.
   */
  async start(): Promise<ServerInfo> {
    if (this.process) {
      throw new Error('Server already running');
    }

    const port = this.options.port;
    if (!port && this.options.transport !== 'stdio') {
      throw new Error('Port required for HTTP transport');
    }

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      MCP_TRANSPORT: this.options.transport,
      MCP_HOST: this.options.host,
      MCP_STATELESS_MODE: String(this.options.statelessMode),
      // Provide a default cursor secret for E2E testing
      MCP_CURSOR_SECRET: process.env['MCP_CURSOR_SECRET'] ?? 'e2e-test-cursor-secret-for-e2e-testing-purposes!',
      ...this.options.env,
    };

    if (port) {
      env['MCP_PORT'] = String(port);
    }

    const cliPath = resolve(this.projectRoot, 'dist/cli.js');

    this.process = spawn('node', [cliPath], {
      cwd: this.projectRoot,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const pid = this.process.pid;
    if (!pid) {
      throw new Error('Failed to get server PID');
    }

    // Collect stderr for startup detection
    let stderrOutput = '';
    const stderrHandler = (data: Buffer) => {
      stderrOutput += data.toString();
    };
    this.process.stderr?.on('data', stderrHandler);

    // Track exit handler for cleanup
    let exitHandler: ((code: number | null) => void) | null = null;

    // Handle early exit
    const earlyExitPromise = new Promise<never>((_, reject) => {
      exitHandler = (code: number | null) => {
        reject(new Error(`Server exited early with code ${code}. stderr: ${stderrOutput}`));
      };
      this.process?.on('exit', exitHandler);
    });

    // Wait for server ready signal in stderr
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Server startup timeout after ${this.options.startupTimeout}ms. stderr: ${stderrOutput}`));
      }, this.options.startupTimeout);

      const checkReady = () => {
        if (stderrOutput.includes('MCP Reference Server started')) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });

    try {
      await Promise.race([readyPromise, earlyExitPromise]);
    } finally {
      // Clean up event listeners to prevent memory leaks
      this.process?.stderr?.removeListener('data', stderrHandler);
      if (exitHandler) {
        this.process?.removeListener('exit', exitHandler);
      }
    }

    return {
      port: port ?? 0,
      pid,
    };
  }

  /**
   * Stop the server process gracefully with SIGTERM.
   * Waits for process to exit with optional timeout.
   */
  async stop(timeoutMs: number = 5000): Promise<void> {
    if (!this.process) {
      return;
    }

    const proc = this.process;
    this.process = null;

    // Check if already exited
    if (proc.exitCode !== null || proc.signalCode !== null) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('Server did not exit within timeout, sent SIGKILL'));
      }, timeoutMs);

      proc.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  /**
   * Get the underlying child process (for stdio communication).
   */
  getProcess(): ChildProcess | null {
    return this.process;
  }

  /**
   * Check if server is currently running.
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Get the server URL for HTTP connections.
   */
  getUrl(): string {
    if (!this.options.port) {
      throw new Error('No port configured');
    }
    return `http://${this.options.host}:${this.options.port}`;
  }
}
