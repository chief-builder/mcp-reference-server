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
[From architecture: languages, frameworks, key libraries]

### Patterns
[From architecture: key patterns, file structure conventions]

### What's Built So Far
[List of completed chunks from bd list --label=[label] --status=closed]
```

This context package is reused for every subagent in this session.

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

    1. Get ready issues: `bd ready --label=[label]`
    2. If none ready → check if blocked or done
    3. Mark in progress: `bd update <id> --status=in_progress`
    4. Spawn subagent(s) to implement (with context package)
       - If multiple ready with non-overlapping scopes → run in parallel
    5. Collect result(s)
    6. Handle each result:
       - SUCCESS → validate → REVIEW → AUDIT → commit/retry
       - FAILED → retry once, then ask user (skip/fix/stop)
       - BLOCKED → mark blocked, continue to next
    7. Loop

END WHILE

→ Pause and suggest "run /auto again"
```
### Code Review Step

After validation passes, spawn the **code-reviewer** agent (`subagent_type: feature-dev:code-reviewer`):

```markdown
Prompt for code-reviewer:

Review the implementation for: [issue title]

FILES_CHANGED: [from implementation subagent]
FILES_CREATED: [from implementation subagent]

Focus on: bugs, logic errors, security issues, and adherence to project conventions.
```

**Handle reviewer response:**

- **High-priority issues found** → Retry implementation with reviewer feedback before proceeding
- **Minor/style issues only** → Note in commit message, proceed to audit
- **Clean** → Proceed to audit

### Audit Step

After implementation succeeds and validation passes, spawn **chunk-auditor** agent:

```
Implementation SUCCESS + Validation passes
    ↓
Spawn chunk-auditor agent
    ↓
┌─ AUDIT COMPLETE ──→ commit → close chunk → increment counter
│
└─ AUDIT INCOMPLETE ──→ Retry implementation with auditor guidance
                           ↓
                    ┌─ AUDIT COMPLETE ──→ commit → close
                    │
                    └─ STILL INCOMPLETE ──→ ask user (skip/fix/stop)
```

The auditor ensures:
- All "Done When" criteria are verifiably met
- Discovered work is tracked in beads (system of record)
- Nothing slips through before closing

## Step 3: Spawn Subagent

For each chunk, use Task tool with `subagent_type="general-purpose"`:

```markdown
Prompt for subagent:

# Implement: [issue title]

## Issue
ID: [beads id]

## Done When (Acceptance Criteria)
[Extract and paste the "Done When" section from the issue description]

## Scope
[Paste scope info from issue description]

## Project Context
[Paste the context package created in Step 1]

## Your Task
1. Read relevant existing code to understand context
2. Implement to satisfy ALL "Done When" criteria above
3. Write/update tests if the project has tests set up
4. Validate: ensure code compiles/parses correctly
5. Report back with results

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
TESTS: [what you tested, or "no tests yet" if project has no test setup]
DISCOVERED: [any issues found outside scope, or "none"]
BLOCKED_REASON: [if status=blocked, explain why]
NOTES: [anything important for next chunks]
```

## Step 4: Handle Results

### On Success

```bash
# Validate (quick check - graceful if commands don't exist)
# Try typecheck if available
npm run typecheck 2>/dev/null || tsc --noEmit 2>/dev/null || echo "No typecheck configured"

# Try tests if available
npm test -- --findRelatedTests [files] 2>/dev/null || npm test 2>/dev/null || echo "No tests configured"
```

**If validation passes (or no validation configured), run the chunk-auditor:**

Read `.claude/agents/chunk-auditor.md` for the auditor's instructions, then use Task tool (`subagent_type="general-purpose"`) with this context:

```markdown
# Audit Chunk

You are the chunk-auditor. Your job is to verify this chunk is truly complete.

## Chunk to Audit
ID: [beads issue id]
Title: [issue title]
Description: [full issue description from bd show <id>]

## Implementation Result
FILES_CHANGED: [from implementation subagent]
FILES_CREATED: [from implementation subagent]
DISCOVERED: [from implementation subagent]

## Project Label
[label] (use this when filing any discovered issues)

## Your Task
Follow the audit process in .claude/agents/chunk-auditor.md:
1. Verify each "Done When" criterion
2. Check discovered work is tracked in beads
3. Return STATUS: complete or incomplete with guidance
```

**Handle auditor response:**

**If auditor returns `STATUS: complete`:**

**Pre-close checklist** (never close without all gates passing):
- [ ] Code reviewer ran and issues addressed
- [ ] Chunk auditor returned STATUS: complete

```bash
# Capture learnings if subagent returned useful NOTES
# (skip if NOTES was empty or "none")
bd update <id> -d "$(bd show <id> --format=description)

## Learnings
[NOTES from implementation subagent]"

bd close <id>
git add -A
git commit -m "feat([label]): [issue title]

Implemented CHUNK-XX as part of [label] project.

Closes beads#[id]

🤖 Auto-implemented by /auto
✓ Audited by chunk-auditor"
bd sync

chunks_completed++
```

**If auditor returns `STATUS: incomplete`:**

Retry implementation with auditor guidance:

```markdown
Prompt for retry subagent:

# Complete: [issue title]

## Issue
ID: [beads id]
Description: [from bd show <id>]

## Previous Attempt
The implementation was incomplete. The auditor found:

CRITERIA_MISSING:
[paste from auditor response]

GUIDANCE:
[paste from auditor response]

## Your Task
Address the missing criteria above. Focus specifically on what the auditor identified.

[Include original context package]
```

After retry, run auditor again. If still incomplete after one retry, escalate to user (see "On Failure" below).

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
# Final validation
npm test
npm run build 2>/dev/null

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
│  IMPLEMENTATION SUBAGENT (per chunk)    │
│  - Gets fresh context                   │
│  - Reads files, implements, debugs      │
│  - Full context for heavy lifting       │
│  - Returns only summary                 │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  CODE-REVIEWER (marketplace agent)      │
│  - Reviews for bugs, logic, security    │
│  - Checks project conventions           │
│  - Returns issues or approval           │
│  - High-priority issues trigger retry   │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  CHUNK-AUDITOR (quality gate)           │
│  - Verifies "Done When" criteria        │
│  - Checks beads tracking                │
│  - Returns complete/incomplete verdict  │
│  - Provides guidance for retry if needed│
└─────────────────────────────────────────┘
```

Each chunk gets dedicated context. Reviewer catches issues early. Auditor ensures quality before close. Orchestrator stays lightweight.

## Anti-Patterns

- Running without `--label` (mixes projects)
- Skipping `bd sync` between chunks
- Not committing after each successful chunk
- Ignoring discovered issues (file them!)
- Fighting through repeated failures instead of skipping/pausing
- Skipping the safety valve pause
- Not reading context package before spawning subagents
- Skipping the auditor step (defeats quality assurance)
- Closing chunks before auditor confirms complete
- Ignoring auditor guidance during retry
- Not tracking discovered work in beads (auditor will catch this!)
