---
description: Autonomous implementation v2 - leaner orchestration
argument-hint: --label=<project> [--max-chunks=N]
---

# Autonomous Implementation

Arguments: $ARGUMENTS

Implement ready beads issues using subagents. Pauses after N chunks as safety valve.

## Configuration

Parse $ARGUMENTS:
- `--label=<name>`: Project isolation (recommended)
- `--max-chunks=N`: Pause after N chunks (default: 5)

**If no --label:** Check `bd ready`. If mixed labels, ask user. If single label, use it.

## Step 1: Initialize

```bash
bd sync
bd stats
bd ready --label=[label]
```

**If no ready issues:** Check `bd blocked`, or celebrate if all done.

### Build Context Package

Find spec/architecture from `docs/breakdowns/*-chunks.md` header, then create (~500 words max):

```markdown
## Context Package

### Project
[One-line goal from spec]

### Tech Stack
[From architecture]

### Patterns
[Key patterns, file conventions]

### Completed
[From bd list --label=[label] --status=closed]
```

## Step 2: Main Loop

```
WHILE chunks_completed < max_chunks:
    1. bd ready --label=[label]
    2. If none → check blocked or done
    3. bd update <id> --status=in_progress
    4. Spawn implementation subagent
    5. On SUCCESS → validate → review → audit → close
       On FAILED → retry once → ask user (skip/stop/retry)
       On BLOCKED → mark blocked, continue
    6. Loop
END → Pause, suggest "/auto again"
```

## Step 3: Implementation Subagent

Spawn `subagent_type="general-purpose"`:

```markdown
# Implement: [issue title]

## Issue
ID: [beads id]

## Done When (Acceptance Criteria)
[From issue description]

## Scope
[From issue description]

## Context
[Context package from Step 1]

## Task
1. Read existing code for context
2. Implement to satisfy ALL criteria above
3. Write/update tests if project has them
4. Validate: code compiles/parses
5. Report results

## Constraints
- Focus ONLY on this issue
- Bugs outside scope → note in DISCOVERED, don't fix
- Unclear requirements → return BLOCKED
- Missing dependency → return BLOCKED

## Report Format
STATUS: success | failed | blocked
FILES_CHANGED: [list]
FILES_CREATED: [list]
TESTS: [what tested]
DISCOVERED: [issues found, or "none"]
BLOCKED_REASON: [if blocked]
NOTES: [learnings for future chunks]
```

## Step 4: Handle Results

### On Success

```bash
# Validate
npm run typecheck 2>/dev/null || tsc --noEmit 2>/dev/null || echo "No typecheck"
npm test -- --findRelatedTests [files] 2>/dev/null || echo "No tests"
```

If validation passes → Code Review → Audit → Close.
If validation fails → treat as failure (see On Failure).

### Code Review

Spawn `subagent_type: feature-dev:code-reviewer` with FILES_CHANGED and FILES_CREATED.

- **High-priority issues** → Retry implementation with feedback
- **Minor issues** → Note in commit, proceed
- **Clean** → Proceed to audit

### Audit

Spawn `subagent_type: chunk-auditor` with:
- Issue ID, title, description (contains "Done When")
- FILES_CHANGED, FILES_CREATED, DISCOVERED
- Project label

The auditor verifies all criteria are met and discovered work is tracked.

- **STATUS: complete** → Close chunk
- **STATUS: incomplete** → Retry with guidance, then re-audit

### Close Chunk

**Pre-close checklist:**
- [ ] Code reviewer ran and issues addressed
- [ ] Chunk auditor returned STATUS: complete

```bash
# Capture learnings if NOTES not empty
bd update <id> -d "$(bd show <id> --format=description)

## Learnings
[NOTES from subagent]"

bd close <id>
git add -A && git commit -m "feat([label]): [issue title]

Closes beads#[id]

Co-Authored-By: Claude <noreply@anthropic.com>"
bd sync
chunks_completed++
```

### On Failure

1. First failure → Retry with error context
2. Second failure → Ask user:
   - **Skip**: `bd update <id> --status=blocked`, continue
   - **Stop**: Pause /auto
   - **Retry**: One more attempt

### On Blocked

```bash
bd update <id> --status=blocked -d "[BLOCKED_REASON]"
```

Continue to next ready issue.

### File Discovered Issues

If DISCOVERED is not "none":

```bash
bd create "[type]: [description]" --type=[bug|chore] --priority=2 --label=[label]
bd sync
```

## Step 5: Pause

After `max_chunks` or no more ready issues:

```bash
git push
bd sync
```

```
PAUSED: Completed [N] chunks. Total: [X/Y]. Run /auto to continue.
```

## Step 6: Done

When `bd ready` empty AND no blocked:

```bash
npm test && npm run build 2>/dev/null
git push && bd sync
```

```
ALL COMPLETE: [N] issues closed, [M] discovered issues filed.
Check: bd list --status=open
```

## Quick Reference

```bash
bd ready --label=[label]    # What's next
bd stats                    # Progress
bd blocked --label=[label]  # What's stuck
/auto --label=[label]       # Resume
```

## Anti-Patterns

- Running without `--label`
- Skipping code review or audit
- Closing before auditor confirms complete
- Not filing discovered issues
- Fighting failures instead of skipping
