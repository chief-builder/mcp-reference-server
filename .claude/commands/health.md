---
description: Run code health inspection and file issues
allowed-tools: Read, Bash, Glob, Grep
---

Conduct a code health inspection on this codebase.

If $ARGUMENTS is provided, focus on that directory or module.

Inspection passes:
1. **Code smells**: Large files (>500 lines), long functions, deep nesting
2. **Coverage gaps**: Missing tests, undocumented code
3. **Structural issues**: Files in wrong places, misleading names
4. **Architectural concerns**: Redundant systems, over-engineering
5. **Cleanup**: Dead code, debug cruft, outdated docs

For each issue found:
- File a Bead with `bd create "[issue]" --label health`
- Prioritize by impact

Remember: 40% of effort should go to code health.
