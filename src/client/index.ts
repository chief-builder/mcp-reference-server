/**
 * MCP Client Module
 *
 * Exports for programmatic use of the MCP client and AI agent.
 */

// MCP Client
export { MCPClient } from './mcp-client.js';
export type {
  MCPClientOptions,
  MCPTool,
  ToolCallResult,
  ConnectionOptions,
  StdioConnectionOptions,
  HttpConnectionOptions,
} from './mcp-client.js';

// LLM Provider
export {
  createLLMProviderAsync,
  getDefaultModelId,
  getAvailableProviders,
} from './llm-provider.js';
export type { LLMConfig } from './llm-provider.js';

// Tools Adapter
export {
  mcpToolToAiTool,
  convertMcpToolsToAiTools,
  jsonSchemaToZod,
  formatToolResult,
} from './tools-adapter.js';

// Agent
export { Agent, runAgent } from './agent.js';
export type { AgentOptions, AgentResult, AgentStep } from './agent.js';

// CLI utilities
export { parseCommand } from './cli.js';
