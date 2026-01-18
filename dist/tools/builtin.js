/**
 * Built-in Tool Registration
 *
 * Factory functions to register the built-in MCP tools with a ToolRegistry.
 * Includes: calculator, dice-roller, fortune-teller
 */
import { calculatorTool } from './calculator.js';
import { diceRollerTool } from './dice-roller.js';
import { fortuneTellerTool, getFortuneCompletions } from './fortune-teller.js';
import { registerFortuneTellerCompletions } from '../completions/handler.js';
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
export function registerBuiltinTools(registry) {
    registry.registerTool(calculatorTool);
    registry.registerTool(diceRollerTool);
    registry.registerTool(fortuneTellerTool);
}
/**
 * Register completions for built-in tools.
 *
 * Sets up auto-complete support for:
 * - Fortune teller: category and mood arguments
 *
 * @param completionHandler - The CompletionHandler to register with
 */
export function registerBuiltinCompletions(completionHandler) {
    registerFortuneTellerCompletions(completionHandler, getFortuneCompletions);
}
/**
 * Register all built-in tools and their completions.
 *
 * Convenience function that registers both tools and completions.
 *
 * @param registry - The ToolRegistry to register tools with
 * @param completionHandler - The CompletionHandler to register completions with
 */
export function registerAllBuiltins(registry, completionHandler) {
    registerBuiltinTools(registry);
    registerBuiltinCompletions(completionHandler);
}
//# sourceMappingURL=builtin.js.map