#!/usr/bin/env node
/**
 * MCP Client CLI
 *
 * Interactive CLI for connecting to MCP servers and chatting with AI agents.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { parse } from 'shell-quote';
import { MCPClient } from './mcp-client.js';
import { createLLMProviderAsync, getDefaultModelId, getAvailableProviders } from './llm-provider.js';
import { Agent } from './agent.js';

/**
 * Parse a shell command string into command and arguments.
 * Handles quoted paths like "path with spaces" and 'single quoted'.
 * @param command - The shell command string to parse
 * @returns Array of parsed arguments (command as first element)
 */
export function parseCommand(command: string): string[] {
  const parsed = parse(command);
  // Filter to only strings (shell-quote can return objects for operators like | > etc.)
  return parsed.filter((arg): arg is string => typeof arg === 'string');
}

const program = new Command();

program
  .name('mcp-client')
  .description('MCP Reference Client with AI Agent')
  .version('1.0.0');

program
  .command('chat')
  .description('Start interactive chat with an MCP server')
  .option('-s, --server <command>', 'Server command to spawn (e.g., "node dist/cli.js")')
  .option('-u, --url <url>', 'HTTP URL to connect to')
  .option('-p, --provider <provider>', 'LLM provider (openrouter or anthropic)', 'openrouter')
  .option('-m, --model <model>', 'Model ID to use')
  .option('-v, --verbose', 'Show verbose output including JSON-RPC messages')
  .action(async (options) => {
    await runChatMode(options);
  });

program
  .command('tools')
  .description('List available tools from an MCP server')
  .option('-s, --server <command>', 'Server command to spawn')
  .option('-u, --url <url>', 'HTTP URL to connect to')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (options) => {
    await listTools(options);
  });

program
  .command('call <tool> [args]')
  .description('Call a specific tool with JSON arguments')
  .option('-s, --server <command>', 'Server command to spawn')
  .option('-u, --url <url>', 'HTTP URL to connect to')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (tool, args, options) => {
    await callTool(tool, args, options);
  });

program
  .command('info')
  .description('Show information about available providers and configuration')
  .action(() => {
    showInfo();
  });

async function runChatMode(options: {
  server?: string;
  url?: string;
  provider?: string;
  model?: string;
  verbose?: boolean;
}): Promise<void> {
  const { server, url, provider, model, verbose } = options;

  if (!server && !url) {
    console.error(chalk.red('Error: Either --server or --url is required'));
    process.exit(1);
  }

  const mcpClient = new MCPClient({ verbose: verbose ?? false });

  try {
    // Connect to server
    if (server) {
      const parts = parseCommand(server);
      const command = parts[0]!;
      const args = parts.slice(1);
      console.log(chalk.blue(`Connecting to server: ${server}`));
      await mcpClient.connectStdio({ command, args });
    } else if (url) {
      console.log(chalk.blue(`Connecting to: ${url}`));
      await mcpClient.connectHttp({ url });
    }

    // List available tools
    const tools = await mcpClient.listTools();
    console.log(chalk.green(`Connected! Available tools: ${tools.map(t => t.name).join(', ')}`));

    // Create LLM provider
    const providerName = (provider || 'openrouter') as 'openrouter' | 'anthropic';
    console.log(chalk.blue(`Using LLM provider: ${providerName}`));
    const llmConfig = model ? { provider: providerName, model } : { provider: providerName };
    const llmModel = await createLLMProviderAsync(llmConfig);
    const modelId = model || getDefaultModelId(providerName);
    console.log(chalk.blue(`Model: ${modelId}`));

    // Create agent
    const agent = new Agent(mcpClient, llmModel, { verbose: verbose ?? false });

    // Start REPL
    console.log(chalk.yellow('\nChat mode started. Type your messages, or:'));
    console.log(chalk.gray('  /tools  - List available tools'));
    console.log(chalk.gray('  /clear  - Clear conversation history'));
    console.log(chalk.gray('  /quit   - Exit'));
    console.log();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = (): void => {
      rl.question(chalk.cyan('You: '), async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
          prompt();
          return;
        }

        // Handle commands
        if (trimmed.startsWith('/')) {
          const cmd = trimmed.toLowerCase();
          if (cmd === '/quit' || cmd === '/exit' || cmd === '/q') {
            console.log(chalk.yellow('Goodbye!'));
            await mcpClient.disconnect();
            rl.close();
            process.exit(0);
          } else if (cmd === '/tools') {
            const tools = await mcpClient.listTools();
            console.log(chalk.green('\nAvailable tools:'));
            for (const tool of tools) {
              console.log(chalk.white(`  ${tool.name}`));
              if (tool.description) {
                console.log(chalk.gray(`    ${tool.description}`));
              }
            }
            console.log();
            prompt();
            return;
          } else if (cmd === '/clear') {
            agent.clearHistory();
            console.log(chalk.yellow('Conversation history cleared.'));
            prompt();
            return;
          } else {
            console.log(chalk.red(`Unknown command: ${cmd}`));
            prompt();
            return;
          }
        }

        // Send to agent
        try {
          console.log(chalk.gray('Thinking...'));
          const result = await agent.chat(trimmed);

          // Show tool calls if verbose
          if (verbose) {
            for (const step of result.steps) {
              if (step.type === 'tool_call') {
                console.log(chalk.magenta(`[Tool Call] ${step.toolName}`));
                if (step.toolArgs) {
                  console.log(chalk.gray(JSON.stringify(step.toolArgs, null, 2)));
                }
              } else if (step.type === 'tool_result') {
                console.log(chalk.magenta(`[Tool Result] ${step.toolName}`));
                console.log(chalk.gray(step.content.substring(0, 200)));
              }
            }
          }

          console.log(chalk.green(`\nAssistant: ${result.text}\n`));

          if (result.usage && verbose) {
            console.log(chalk.gray(`Tokens: ${result.usage.totalTokens} (prompt: ${result.usage.promptTokens}, completion: ${result.usage.completionTokens})`));
          }
        } catch (error) {
          console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
        }

        prompt();
      });
    };

    prompt();

    // Handle cleanup
    rl.on('close', async () => {
      await mcpClient.disconnect();
    });

  } catch (error) {
    console.error(chalk.red(`Failed to start: ${error instanceof Error ? error.message : error}`));
    await mcpClient.disconnect();
    process.exit(1);
  }
}

async function listTools(options: {
  server?: string;
  url?: string;
  verbose?: boolean;
}): Promise<void> {
  const { server, url, verbose } = options;

  if (!server && !url) {
    console.error(chalk.red('Error: Either --server or --url is required'));
    process.exit(1);
  }

  const mcpClient = new MCPClient({ verbose: verbose ?? false });

  try {
    if (server) {
      const parts = parseCommand(server);
      const command = parts[0]!;
      const args = parts.slice(1);
      await mcpClient.connectStdio({ command, args });
    } else if (url) {
      await mcpClient.connectHttp({ url });
    }

    const tools = await mcpClient.listTools();

    console.log(chalk.green(`\nFound ${tools.length} tools:\n`));
    for (const tool of tools) {
      console.log(chalk.white(`${tool.name}`));
      if (tool.description) {
        console.log(chalk.gray(`  ${tool.description}`));
      }
      if (verbose && tool.inputSchema.properties) {
        console.log(chalk.gray(`  Parameters: ${JSON.stringify(tool.inputSchema.properties, null, 2)}`));
      }
      console.log();
    }

    await mcpClient.disconnect();
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    await mcpClient.disconnect();
    process.exit(1);
  }
}

async function callTool(
  toolName: string,
  argsJson: string | undefined,
  options: {
    server?: string;
    url?: string;
    verbose?: boolean;
  }
): Promise<void> {
  const { server, url, verbose } = options;

  if (!server && !url) {
    console.error(chalk.red('Error: Either --server or --url is required'));
    process.exit(1);
  }

  const mcpClient = new MCPClient({ verbose: verbose ?? false });

  try {
    if (server) {
      const parts = parseCommand(server);
      const command = parts[0]!;
      const cmdArgs = parts.slice(1);
      await mcpClient.connectStdio({ command, args: cmdArgs });
    } else if (url) {
      await mcpClient.connectHttp({ url });
    }

    const args = argsJson ? JSON.parse(argsJson) : {};
    console.log(chalk.blue(`Calling tool: ${toolName}`));
    if (verbose) {
      console.log(chalk.gray(`Arguments: ${JSON.stringify(args, null, 2)}`));
    }

    const result = await mcpClient.callTool(toolName, args);

    if (result.isError) {
      console.error(chalk.red('Tool returned error:'));
    } else {
      console.log(chalk.green('Result:'));
    }

    for (const content of result.content) {
      if (content.type === 'text' && content.text) {
        console.log(content.text);
      } else {
        console.log(JSON.stringify(content, null, 2));
      }
    }

    await mcpClient.disconnect();
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    await mcpClient.disconnect();
    process.exit(1);
  }
}

function showInfo(): void {
  console.log(chalk.blue('\nMCP Client Information\n'));

  const providers = getAvailableProviders();

  console.log(chalk.white('Available Providers:'));
  console.log(chalk.green(`  openrouter: ${providers.openrouter ? 'Available (free tier)' : 'Not available'}`));
  console.log(chalk.green(`  anthropic: ${providers.anthropic ? 'Available (ANTHROPIC_API_KEY set)' : 'Not available (set ANTHROPIC_API_KEY)'}`));

  console.log(chalk.white('\nDefault Models:'));
  console.log(chalk.gray(`  openrouter: ${getDefaultModelId('openrouter')}`));
  console.log(chalk.gray(`  anthropic: ${getDefaultModelId('anthropic')}`));

  console.log(chalk.white('\nEnvironment Variables:'));
  console.log(chalk.gray('  OPENROUTER_API_KEY - OpenRouter API key (optional for free tier)'));
  console.log(chalk.gray('  ANTHROPIC_API_KEY  - Anthropic API key (enables Claude models)'));
  console.log(chalk.gray('  MCP_CLIENT_VERBOSE - Enable verbose logging'));

  console.log(chalk.white('\nExamples:'));
  console.log(chalk.gray('  # Chat with local MCP server'));
  console.log(chalk.cyan('  mcp-client chat --server "node dist/cli.js"'));
  console.log(chalk.gray('  # List tools from HTTP server'));
  console.log(chalk.cyan('  mcp-client tools --url http://localhost:3000/mcp'));
  console.log(chalk.gray('  # Call a tool directly'));
  console.log(chalk.cyan('  mcp-client call calculator \'{"operation":"add","a":5,"b":3}\' --server "node dist/cli.js"'));
  console.log();
}

program.parse();
