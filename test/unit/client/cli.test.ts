/**
 * Client CLI Tests
 *
 * Tests for the MCP client CLI module, specifically:
 * - Shell command parsing with shell-quote
 * - Handling of quoted paths
 * - Special characters in arguments
 */

import { describe, it, expect } from 'vitest';
import { parse } from 'shell-quote';

/**
 * Re-implementation of parseCommand for testing.
 * This mirrors the implementation in src/client/cli.ts but avoids
 * importing the CLI module which triggers program.parse().
 */
function parseCommand(command: string): string[] {
  const parsed = parse(command);
  return parsed.filter((arg): arg is string => typeof arg === 'string');
}

// =============================================================================
// Shell Command Parsing Tests
// =============================================================================

describe('parseCommand', () => {
  describe('basic parsing', () => {
    it('should parse a simple command with no arguments', () => {
      const result = parseCommand('node');
      expect(result).toEqual(['node']);
    });

    it('should parse a command with simple arguments', () => {
      const result = parseCommand('node dist/cli.js');
      expect(result).toEqual(['node', 'dist/cli.js']);
    });

    it('should parse a command with multiple arguments', () => {
      const result = parseCommand('node dist/cli.js --port 3000 --host localhost');
      expect(result).toEqual(['node', 'dist/cli.js', '--port', '3000', '--host', 'localhost']);
    });
  });

  describe('double-quoted paths', () => {
    it('should handle double-quoted paths with spaces', () => {
      const result = parseCommand('node "path with spaces/cli.js"');
      expect(result).toEqual(['node', 'path with spaces/cli.js']);
    });

    it('should handle multiple double-quoted arguments', () => {
      const result = parseCommand('"my node" "path with spaces/cli.js" "--arg with space"');
      expect(result).toEqual(['my node', 'path with spaces/cli.js', '--arg with space']);
    });

    it('should handle a complex path with spaces', () => {
      const result = parseCommand('"/usr/local/bin/my app" "/Users/user/Documents/My Project/server.js"');
      expect(result).toEqual(['/usr/local/bin/my app', '/Users/user/Documents/My Project/server.js']);
    });
  });

  describe('single-quoted paths', () => {
    it('should handle single-quoted paths with spaces', () => {
      const result = parseCommand("node 'path with spaces/cli.js'");
      expect(result).toEqual(['node', 'path with spaces/cli.js']);
    });

    it('should handle mixed single and double quotes', () => {
      const result = parseCommand('node "double quoted" \'single quoted\'');
      expect(result).toEqual(['node', 'double quoted', 'single quoted']);
    });
  });

  describe('special characters', () => {
    it('should handle paths with hyphens', () => {
      const result = parseCommand('node my-cli-tool.js');
      expect(result).toEqual(['node', 'my-cli-tool.js']);
    });

    it('should handle paths with underscores', () => {
      const result = parseCommand('node my_cli_tool.js');
      expect(result).toEqual(['node', 'my_cli_tool.js']);
    });

    it('should handle paths with dots', () => {
      const result = parseCommand('node ./dist/cli.js');
      expect(result).toEqual(['node', './dist/cli.js']);
    });

    it('should handle paths with equals signs in arguments', () => {
      const result = parseCommand('node cli.js --config=myconfig.json');
      expect(result).toEqual(['node', 'cli.js', '--config=myconfig.json']);
    });
  });

  describe('shell operators filtering', () => {
    it('should filter out pipe operators', () => {
      const result = parseCommand('node cli.js | grep error');
      // shell-quote returns operators as objects, our filter removes them
      expect(result).toEqual(['node', 'cli.js', 'grep', 'error']);
    });

    it('should filter out redirect operators', () => {
      const result = parseCommand('node cli.js > output.txt');
      // The > becomes an operator object and is filtered out
      expect(result).toEqual(['node', 'cli.js', 'output.txt']);
    });

    it('should filter out semicolons', () => {
      const result = parseCommand('node cli.js; echo done');
      expect(result).toEqual(['node', 'cli.js', 'echo', 'done']);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = parseCommand('');
      expect(result).toEqual([]);
    });

    it('should handle whitespace-only string', () => {
      const result = parseCommand('   ');
      expect(result).toEqual([]);
    });

    it('should handle multiple spaces between arguments', () => {
      const result = parseCommand('node    dist/cli.js     --verbose');
      expect(result).toEqual(['node', 'dist/cli.js', '--verbose']);
    });

    it('should handle tabs and newlines', () => {
      const result = parseCommand('node\tdist/cli.js');
      expect(result).toEqual(['node', 'dist/cli.js']);
    });
  });

  describe('real-world examples', () => {
    it('should parse typical MCP server command', () => {
      const result = parseCommand('node dist/cli.js');
      expect(result).toEqual(['node', 'dist/cli.js']);
    });

    it('should parse npx command', () => {
      const result = parseCommand('npx mcp-server --port 3000');
      expect(result).toEqual(['npx', 'mcp-server', '--port', '3000']);
    });

    it('should parse Python command with path containing spaces', () => {
      const result = parseCommand('python "/Users/dev/My Projects/mcp-server/main.py"');
      expect(result).toEqual(['python', '/Users/dev/My Projects/mcp-server/main.py']);
    });

    it('should parse command with JSON argument', () => {
      const result = parseCommand('node cli.js call calculator \'{"operation":"add","a":5,"b":3}\'');
      expect(result).toEqual(['node', 'cli.js', 'call', 'calculator', '{"operation":"add","a":5,"b":3}']);
    });
  });
});
