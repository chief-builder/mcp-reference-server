---
description: Implementation mode with beads integration
---

# Implementation Mode with Beads

Arguments: $ARGUMENTS

## Step 1: Understand the Work

First, gather context about what we're implementing.

**If $ARGUMENTS provided**: Use that as the task description.
**If no arguments**: Ask the user:
- "What are you implementing today?"
- "Is there an existing beads issue for this work?"

## Step 2: Clarify Work Style

Ask the user about their preferred workflow:

1. **Single task focus**: Working on one issue at a time
2. **Parallel tasks**: Multiple related tasks simultaneously
3. **Exploration mode**: Investigating/spiking before committing to approach
4. **Bug hunt**: Fixing multiple small issues in one session
5. **Domain focus**: Working only on a specific domain (for parallel agents)

Based on their answer, adjust tracking strategy:
- Single task: One `in_progress` issue, strict focus
- Parallel: Multiple `in_progress` allowed, track in TodoWrite too
- Exploration: Create spike issue, file discovered issues as you go
- Bug hunt: Create umbrella issue or work through existing bug list
- Domain focus: Filter tasks by domain label (see Step 2.5)

## Step 2.5: Domain Context (for parallel work)

If user selected "Domain focus" or wants to minimize conflicts with other agents:

**Get available domains:**

1. **Breakdown doc exists?** (check `docs/breakdowns/`)
   - Read domains from Configuration table
   - Show list to user

2. **No breakdown?** Check existing beads labels:
   ```bash
   bd list --all   # Look for existing --label patterns in output
   ```

3. **No labels in beads?** Ask user:
   ```
   "Working with parallel agents? Define domains or skip:
    - Define domains now
    - Skip (work on any task)"
   ```

**If domain selected**, use it to filter available work:
```bash
bd ready --label=<domain>   # Only tasks in this domain
```

Store the selected domain for use when filing discovered issues.

## Step 3: Set Up Tracking

Check existing beads status:
```bash
bd ready      # Available work
bd blocked    # Stuck items
bd stats      # Overall picture
```

Then either:
- **Link to existing issue**: `bd update <id> --status=in_progress`
- **Create new issue**: `bd create "Title" --type=task --priority=2 --label=<domain> -d "Description"`
  (Omit `--label` if no domains are defined)

## During Implementation

### Golden Rule: File Discovered Issues Immediately

When you find something that's NOT your current task:

| Discovery | Command |
|-----------|---------|
| Bug | `bd create "Fix: [bug]" --type=bug --priority=1 --label=<domain>` |
| Tech debt | `bd create "Refactor: [what]" --type=chore --priority=3 --label=<domain>` |
| Missing feature | `bd create "Add: [feature]" --type=feature --priority=2 --label=<domain>` |
| Blocker | `bd create "Blocker: [what]" --type=task --priority=1 --label=<domain>` then `bd dep add <current> <blocker>` |
| Security issue | `bd create --type=bug --priority=0 --label=<domain>` + **FIX NOW** |

**Label assignment**: Use the domain that matches where the issue belongs (not necessarily your current domain). If unsure or spans multiple, use `cross-cutting`. Omit `--label` if no domains are defined.

### Decision Points

When discovering issues, ask the user:
- "Found [issue]. Should I file it and continue, or address it now?"
- "This looks like scope creep. Want me to file it for later?"
- "This blocks our work. Should I switch focus?"

### Status Updates

Keep beads in sync with reality:
```bash
bd update <id> --status=in_progress  # Starting
bd close <id>                        # Completing
bd close <id> --reason="..."         # Closing with context
```

## Quality Gate (Before Closing)

Before marking a chunk as complete, ask the user:

"Implementation looks complete. Before closing:"
- **Quick review**: Visual scan, run tests, move on
- **Full /r5 review**: 5-pass deep review (recommended for complex/risky chunks)
- **Skip review**: Close immediately (for trivial changes)

If user chooses /r5, run it and incorporate any findings before proceeding.

## Session Close Protocol

Before declaring work complete, ALWAYS run:

```bash
git status              # Review changes
git add <files>         # Stage code
bd sync                 # Sync beads state
git commit -m "..."     # Commit code
bd sync                 # Catch any new beads
git push                # Push to remote
```

## Quick Reference

```bash
# Find work
bd ready                           # What's available
bd ready --label=<domain>          # Filter by domain (parallel work)
bd show <id>                       # Issue details
bd list --status=in_progress       # Active work

# Track work
bd update <id> --status=in_progress
bd close <id>

# File discoveries (include --label if domains defined)
bd create "Title" --type=<type> --priority=<0-4> --label=<domain> -d "..."
bd dep add <dependent> <blocker>

# Stay synced
bd sync
```

## Anti-Patterns

- Working without active issue tracking
- Finding issues but not filing them
- Scope creep without user approval
- Ending session without `bd sync` and `git push`
- Forgetting to close completed issues
