---
description: Autonomous implementation - works through beads issues using subagents
argument-hint: --label=<project> [--max-chunks=N]
---

# Autonomous Implementation

Arguments: $ARGUMENTS

Autonomously implement all ready beads issues, using a fresh subagent for each chunk. Pauses after N chunks as a safety valve.

## Configuration

Parse $ARGUMENTS for options:
- `--label=<name>`: Only work on issues with this label (project isolation) **recommended**
- `--max-chunks=N`: Pause after N chunks (default: 5)

**If no --label provided:**
1. Run `bd ready` and check if all issues share a common label
2. If mixed labels, ask user: "Multiple projects found. Which label to work on?"
3. If single label, use it automatically

## Step 1: Initialize

### Check Beads State

```bash
bd sync                            # Ensure up to date
bd stats                           # Overall picture
bd ready --label=[label]           # What's available for this project
```

**If no ready issues**:
- Check `bd blocked --label=[label]` - show blockers if any
- Check `bd stats` - if all closed for this label, celebrate!
- Otherwise, explain situation and exit

### Load Context for Subagents

Find the chunks file to get spec/architecture paths:
```bash
ls docs/breakdowns/*-chunks.md     # Find chunks file
```

Read the chunks file header to find:
- `**Spec**: docs/specs/<name>.md`
- `**Architecture**: docs/architecture/<name>.md`

Then read those files and create a **context package** (~500 words max):

```markdown
## Context Package (pass to each subagent)

### Project
[Project name and one-line goal from spec]

### Tech Stack
[From architecture: language, framework, key libraries]
[Examples: "Python 3.11 + FastAPI + SQLAlchemy" or "TypeScript + React + Express" or "Rust + Actix-web"]

### Build/Test Commands
[From architecture or detected from project files]
[Examples: "npm test" or "pytest" or "cargo test" or "go test ./..."]

### Patterns
[From architecture: key patterns, file structure conventions]

### What's Built So Far
[List of completed chunks from bd list --label=[label] --status=closed]
```

This context package is reused for every subagent in this session.

**Note**: The tech stack info helps subagents write idiomatic code and run correct validation.

### Show Status

```
┌─────────────────────────────────────────┐
│  /auto starting                         │
├─────────────────────────────────────────┤
│  Project: [label]                       │
│  Ready issues: [N]                      │
│  Max chunks this session: [M]           │
└─────────────────────────────────────────┘
```

## Step 2: Main Loop

```
chunks_completed = 0
failed_chunks = {}   # Track failures per chunk

WHILE chunks_completed < max_chunks:

    1. Get next issue: `bd ready --label=[label]` → pick first
    2. If none ready → check if blocked or done
    3. Mark in progress: `bd update <id> --status=in_progress`
    4. Spawn subagent to implement (with context package)
    5. Collect result
    6. Handle result:
       - SUCCESS → validate, commit, increment counter
       - FAILED → retry once, then ask user (skip/fix/stop)
       - BLOCKED → mark blocked, continue to next
    7. Loop

END WHILE

→ Pause and suggest "run /auto again"
```

## Step 3: Spawn Subagent

For each chunk, use Task tool with `subagent_type="general-purpose"`:

```markdown
Prompt for subagent:

# Implement: [issue title]

## Issue
ID: [beads id]
Description: [from bd show <id>]

## Project Context
[Paste the context package created in Step 1]

## Your Task
1. Read relevant existing code to understand context
2. Implement the issue completely
3. Write/update tests if the project has tests set up
4. Run verification pass (see below)
5. Report back with results

## Verification Pass (REQUIRED before reporting success)

After implementation, verify your work:

1. **Syntax check**: Ensure all modified/created files parse correctly
   - Run the appropriate linter or compiler for the tech stack

2. **Type check** (if applicable): Run type checker
   - TypeScript: `tsc --noEmit`
   - Python: `mypy` or `pyright` if configured
   - Rust: `cargo check`
   - Go: `go build ./...`

3. **Test run**: Run tests related to your changes
   - Use project's test command from Build/Test Commands in context
   - At minimum, run tests for files you modified

4. **Quick smoke test**: Verify the feature works as intended
   - For APIs: test endpoint manually if possible
   - For UI: check component renders without errors
   - For libraries: verify exports work

5. **Self-review**: Check your own code for:
   - Obvious bugs or logic errors
   - Missing error handling
   - Hardcoded values that should be configurable
   - Security issues (injection, exposed secrets)

**If any verification fails**: Fix the issue before reporting. Only report STATUS: success if ALL verifications pass.

## Constraints
- Focus ONLY on this issue
- If you find bugs/issues outside scope → note them, don't fix
- If requirements are unclear → return BLOCKED with specific questions
- If you need something not yet built → return BLOCKED explaining what's missing

## When Done
Report in this exact format:

STATUS: success | failed | blocked
FILES_CHANGED: [list of modified files]
FILES_CREATED: [list of new files]
VERIFICATION:
  - Syntax: pass | fail | skipped
  - Types: pass | fail | skipped | n/a
  - Tests: pass | fail | skipped | no tests configured
  - Smoke: pass | fail | skipped
  - Self-review: pass | issues fixed
TESTS_RUN: [specific tests executed, or "none"]
DISCOVERED: [any issues found outside scope, or "none"]
BLOCKED_REASON: [if status=blocked, explain why]
NOTES: [anything important for next chunks]
```

## Step 4: Handle Results

### On Success

#### Detect and Run Validation

Detect project type and run appropriate validation. Check for these files in order:

| File | Tech Stack | Validation Commands |
|------|------------|---------------------|
| `package.json` | Node.js/TypeScript | `npm run typecheck 2>/dev/null; npm test 2>/dev/null` |
| `pyproject.toml` or `setup.py` | Python | `python -m py_compile [files]; pytest 2>/dev/null` |
| `Cargo.toml` | Rust | `cargo check; cargo test 2>/dev/null` |
| `go.mod` | Go | `go build ./...; go test ./... 2>/dev/null` |
| `pom.xml` or `build.gradle` | Java | `mvn compile 2>/dev/null \|\| gradle build 2>/dev/null` |
| `Makefile` | Generic | `make check 2>/dev/null \|\| make test 2>/dev/null` |
| *(none found)* | Unknown | Skip validation, rely on subagent's self-check |

**Run validation gracefully** - don't fail if commands don't exist:
```bash
# Example for detected stack (adapt based on detection)
[validation_command] 2>/dev/null || echo "Validation skipped or not configured"
```

**If validation passes (or no validation configured):**
```bash
bd close <id>
git add -A
git commit -m "feat([label]): [issue title]

Implemented CHUNK-XX as part of [label] project.

Closes beads#[id]

🤖 Auto-implemented by /auto"
bd sync

chunks_completed++
```

**If validation fails:** Treat as failure (see below).

### On Failure

If subagent reports failure OR validation fails:

1. **First failure**: Spawn new subagent with error context, retry once
2. **Second failure**: Ask user with AskUserQuestion:

```
┌─────────────────────────────────────────┐
│  Implementation failed: [issue title]   │
├─────────────────────────────────────────┤
│  Error: [summary]                       │
│                                         │
│  Options:                               │
│  1. Skip - mark as blocked, continue    │
│  2. Stop - pause /auto, fix manually    │
│  3. Retry - try one more time           │
└─────────────────────────────────────────┘
```

**If user chooses Skip:**
```bash
bd update <id> --status=blocked -d "Skipped by /auto: [error summary]"
```
Continue to next issue.

**If user chooses Stop:**
Pause /auto, let user fix manually, they can run `/auto` again later.

### On Blocked

If subagent reports blocked:

```bash
bd update <id> --status=blocked -d "[BLOCKED_REASON from subagent]"
```

Log the blocked reason, continue to next ready issue.

**If no more ready issues** (all remaining are blocked or have unmet dependencies):
```
┌─────────────────────────────────────────┐
│  PAUSED: No more ready issues           │
├─────────────────────────────────────────┤
│  Completed: [N]                         │
│  Blocked: [M] (see bd blocked)          │
│                                         │
│  Resolve blockers, then /auto again     │
└─────────────────────────────────────────┘
```

### File Discovered Issues

If subagent reports discovered issues (DISCOVERED field is not "none"):

```bash
bd create "[type]: [description]" --type=[bug|chore] --priority=2 --label=[label] -d "Found while implementing [issue]"
bd sync
```

This keeps discovered issues in the same project for later attention.

## Step 5: Safety Valve Pause

After `max_chunks` completed:

```bash
git push                 # Push all commits
bd sync                  # Ensure beads is synced
```

```
┌─────────────────────────────────────────┐
│  PAUSED: Safety valve                   │
├─────────────────────────────────────────┤
│  Completed this session: [N]            │
│  Total progress: [X/Y] issues           │
│  Commits pushed: ✓                      │
│                                         │
│  Run /auto to continue                  │
└─────────────────────────────────────────┘
```

## Step 6: Completion

When `bd ready` returns empty AND no blocked issues:

```bash
# Final validation (use detected tech stack commands)
# Node.js:    npm test && npm run build
# Python:     pytest && python -m build
# Rust:       cargo test && cargo build --release
# Go:         go test ./... && go build ./...
# Java:       mvn test && mvn package
# Or skip if no build/test configured

git push
bd sync
```

```
┌─────────────────────────────────────────┐
│  ✓ ALL CHUNKS COMPLETE                  │
├─────────────────────────────────────────┤
│  Issues closed: [N]                     │
│  Commits: [N]                           │
│  Discovered issues filed: [N]           │
│                                         │
│  Check discovered issues:               │
│    bd list --status=open                │
└─────────────────────────────────────────┘
```

## Quick Reference

```bash
# Check state (for specific project)
bd ready --label=[label]       # What's next
bd stats                       # Overall progress
bd blocked --label=[label]     # What's stuck

# During pause
git status                     # Review changes
bd list --label=[label]        # All issues for this project

# Resume
/auto --label=[label]                    # Continue this project
/auto --label=[label] --max-chunks=10    # Longer session
```

## How It Uses Context Efficiently

```
┌─────────────────────────────────────────┐
│  ORCHESTRATOR (this command)            │
│  - Runs bd commands (small output)      │
│  - Spawns subagents (passes summary)    │
│  - Receives result summaries (small)    │
│  - Stays lean, can run many iterations  │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  SUBAGENT (Task tool, per chunk)        │
│  - Gets fresh context                   │
│  - Reads files, implements, debugs      │
│  - Full context for heavy lifting       │
│  - Returns only summary                 │
└─────────────────────────────────────────┘
```

Each chunk gets dedicated context. Orchestrator stays lightweight.

## Anti-Patterns

- Running without `--label` (mixes projects)
- Skipping `bd sync` between chunks
- Not committing after each successful chunk
- Ignoring discovered issues (file them!)
- Fighting through repeated failures instead of skipping/pausing
- Skipping the safety valve pause
- Not reading context package before spawning subagents
