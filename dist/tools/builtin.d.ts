/**
 * Built-in Tool Registration
 *
 * Factory functions to register the built-in MCP tools with a ToolRegistry.
 * Includes: calculator, dice-roller, fortune-teller
 */
import type { ToolRegistry } from './registry.js';
import type { CompletionHandler } from '../completions/handler.js';
/**
 * Register all built-in tools with a ToolRegistry.
 *
 * Built-in tools:
 * - calculate: Basic arithmetic operations (add, subtract, multiply, divide)
 * - roll_dice: Dice rolling with standard notation (e.g., 2d6, 1d20+5)
 * - tell_fortune: Fortune generation by category and mood
 *
 * @param registry - The ToolRegistry to register tools with
 */
export declare function registerBuiltinTools(registry: ToolRegistry): void;
/**
 * Register completions for built-in tools.
 *
 * Sets up auto-complete support for:
 * - Fortune teller: category and mood arguments
 *
 * @param completionHandler - The CompletionHandler to register with
 */
export declare function registerBuiltinCompletions(completionHandler: CompletionHandler): void;
/**
 * Register all built-in tools and their completions.
 *
 * Convenience function that registers both tools and completions.
 *
 * @param registry - The ToolRegistry to register tools with
 * @param completionHandler - The CompletionHandler to register completions with
 */
export declare function registerAllBuiltins(registry: ToolRegistry, completionHandler: CompletionHandler): void;
//# sourceMappingURL=builtin.d.ts.map