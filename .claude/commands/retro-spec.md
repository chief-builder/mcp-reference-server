---
description: Create specification from existing code (describes what IS)
argument-hint: [file or directory path]
model: opus
---

# Retroactive Specification

Arguments: $ARGUMENTS

Generate a specification by analyzing existing code. Documents what the code **currently does**, not what it should do.

## Step 1: Identify Target

**If $ARGUMENTS provided**: Use that as the target file or directory.
**If no arguments**:
```bash
# Show source structure
ls -d src/*/ 2>/dev/null || ls -d lib/*/ 2>/dev/null || ls -d app/*/ 2>/dev/null
```
Then ask: "Which module or file should I create a retro-spec for?"

Validate target exists:
```bash
ls -la $ARGUMENTS 2>/dev/null || echo "Target not found"
```

## Step 2: Scope Analysis

Determine what we're documenting:

**If target is a file**:
```bash
wc -l $ARGUMENTS
head -100 $ARGUMENTS
```

**If target is a directory**:
```bash
find $ARGUMENTS -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.rs" -o -name "*.go" \) 2>/dev/null | head -30
find $ARGUMENTS -type f | wc -l
```

For large directories, ask: "This contains [N] files. Should I focus on the main entry point, or analyze all files?"

## Step 3: Deep Code Analysis

### Exports & Public Interface

```bash
# TypeScript/JavaScript exports
grep -n "^export" $ARGUMENTS 2>/dev/null || grep -rn "^export" $ARGUMENTS --include="*.ts" --include="*.js" 2>/dev/null | head -40

# Default exports
grep -n "export default" $ARGUMENTS 2>/dev/null || grep -rn "export default" $ARGUMENTS --include="*.ts" --include="*.js" 2>/dev/null

# Python exports
grep -n "^def \|^class \|^async def " $ARGUMENTS 2>/dev/null || grep -rn "^def \|^class " $ARGUMENTS --include="*.py" 2>/dev/null | head -40

# Rust pub items
grep -n "^pub " $ARGUMENTS 2>/dev/null || grep -rn "^pub " $ARGUMENTS --include="*.rs" 2>/dev/null | head -40

# Go exports (capitalized)
grep -n "^func [A-Z]\|^type [A-Z]" $ARGUMENTS 2>/dev/null || grep -rn "^func [A-Z]" $ARGUMENTS --include="*.go" 2>/dev/null | head -40
```

### Types & Interfaces

```bash
# TypeScript interfaces and types
grep -n "^interface \|^type \|^enum " $ARGUMENTS 2>/dev/null || grep -rn "^interface \|^type \|^enum " $ARGUMENTS --include="*.ts" 2>/dev/null | head -30

# Python type hints and classes
grep -n "class \|: .*=" $ARGUMENTS 2>/dev/null | head -30

# Rust structs and enums
grep -n "^struct \|^enum \|^trait " $ARGUMENTS 2>/dev/null || grep -rn "^struct \|^enum " $ARGUMENTS --include="*.rs" 2>/dev/null | head -30
```

### Dependencies & Imports

```bash
# What this module depends on
grep -n "^import \|^from .* import" $ARGUMENTS 2>/dev/null | head -30
grep -rn "^import \|require(" $ARGUMENTS --include="*.ts" --include="*.js" 2>/dev/null | head -30

# External vs internal imports
grep "from ['\"]" $ARGUMENTS 2>/dev/null | grep -v "^\." | head -20
```

### Patterns & Behaviors

Read the main files and identify:
- Control flow patterns (async/await, callbacks, streams)
- Error handling patterns (try/catch, Result types, error callbacks)
- State management (singletons, context, stores)
- Side effects (file I/O, network, database)

## Step 4: Test Analysis

Find and analyze related tests:

```bash
# Find test files
find . -name "*test*.ts" -o -name "*spec*.ts" -o -name "test_*.py" -o -name "*_test.py" -o -name "*_test.go" 2>/dev/null | grep -i "$(basename $ARGUMENTS .ts)" | head -10

# Common test locations
ls test/*$(basename $ARGUMENTS)* 2>/dev/null
ls tests/*$(basename $ARGUMENTS)* 2>/dev/null
ls __tests__/*$(basename $ARGUMENTS)* 2>/dev/null
ls *_test.* 2>/dev/null
ls *.test.* 2>/dev/null
```

From tests, extract:
- **Happy paths**: What the code is expected to do
- **Edge cases**: Boundary conditions handled
- **Error scenarios**: How failures are handled
- **Mocking patterns**: What external dependencies exist

```bash
# Test descriptions
grep -n "describe\|it(\|test(\|def test_" [test-file] 2>/dev/null | head -40
```

## Step 5: Infer Requirements

Based on code and test analysis, document:

### Functional Requirements
- What does this module DO?
- What inputs does it accept?
- What outputs does it produce?
- What transformations occur?

### Non-Functional Requirements
- Performance characteristics (async, batching, caching)
- Error handling strategy
- Logging/observability
- Security considerations (input validation, auth)

### Integration Points
- What does this module import/depend on?
- What imports this module?
- External services/APIs called
- Events emitted/consumed

## Step 6: Generate Specification

Create `docs/specs/retro-[module-name].md`:

```markdown
# [Module Name] - Retroactive Specification

**Generated**: [date]
**Source**: [target path]
**Type**: Retroactive (documents existing behavior)

## Overview

[2-3 sentence summary of what this module does]

## Public Interface

### Exports

| Name | Type | Description |
|------|------|-------------|
| [export1] | [function/class/const] | [what it does] |
| [export2] | [type/interface] | [what it defines] |

### Types

```typescript
// Key types defined by this module
[paste relevant type definitions]
```

## Behavior

### Core Functionality

1. **[Behavior 1]**: [description]
   - Input: [what it accepts]
   - Output: [what it returns]
   - Side effects: [any mutations or I/O]

2. **[Behavior 2]**: [description]
   ...

### Error Handling

| Condition | Behavior |
|-----------|----------|
| [error case 1] | [what happens] |
| [error case 2] | [what happens] |

### Edge Cases

- [edge case 1]: [how handled]
- [edge case 2]: [how handled]

## Dependencies

### Internal
- `[module]`: [why needed]

### External
- `[package]`: [what for]

## Integration Points

### Consumers
- [who calls this module]

### Called Services
- [external APIs, databases, etc]

## Test Coverage

**Test file**: [path]
**Coverage**: [if known]

### Tested Behaviors
- [x] [behavior from tests]
- [x] [behavior from tests]

### Untested Behaviors
- [ ] [gaps identified]

## Observations

### Patterns Used
- [design patterns observed]

### Technical Debt
- [issues noticed during analysis]

### Potential Improvements
- [suggestions, marked as observations not requirements]

## Open Questions

- [uncertainties about behavior]
- [areas needing clarification from code owners]
```

## Step 7: Optional Beads Integration

Ask user: "Should I file observations as beads issues for tracking?"

**If yes**:
```bash
bd sync

# File observations as issues
bd create "[Observation title]" --type=task --label=retro-spec -d "[description]"
```

Categories for beads:
- **Missing tests**: File as `--label=test-gap`
- **Technical debt**: File as `--label=tech-debt`
- **Documentation gaps**: File as `--label=docs`

## Step 8: Save and Commit

```bash
mkdir -p docs/specs
git add docs/specs/retro-*.md
git commit -m "docs: retro-spec for [module]"
```

## Step 9: Summary

Display:
```
Retro-spec complete!

Module: [name]
Spec: docs/specs/retro-[name].md

Documented:
- [N] exports
- [N] types
- [N] behaviors

Observations:
- [N] test gaps
- [N] technical debt items
- [N] documentation needs

[If beads used]: Issues filed: [N]

Next steps:
  /test-audit         - Deep test analysis
  /health             - Code quality scan
  /spec [feature]     - Plan new work on this module
```

## Retro-Spec vs Spec

| Retro-Spec | Spec |
|------------|------|
| Documents existing code | Plans new code |
| Describes what IS | Describes what SHOULD BE |
| Analysis-driven | Interview-driven |
| Finds behavior in code/tests | Creates requirements from discussion |
| Output: retro-*.md | Output: [feature].md |

## Anti-Patterns

- Writing requirements instead of observations
- Suggesting changes instead of documenting behavior
- Skipping test analysis (tests reveal expected behavior)
- Not noting uncertainties (mark "observed but unclear")
- Creating spec for trivial utility functions
- Filing beads without user consent
