---
description: Lightweight implementation mode - no beads, uses chunks markdown
---

# Lightweight Implementation Mode

Arguments: $ARGUMENTS

## Step 1: Understand the Work

First, gather context about what we're implementing.

**If $ARGUMENTS provided**: Use that as the task description.
**If no arguments**:
- Check `docs/breakdowns/` for a `*-chunks.md` file
- Show the user uncompleted chunks and ask which to work on

## Step 2: Load Context

Before implementing, read relevant documentation:

1. **Chunks file**: `docs/breakdowns/*-chunks.md` - find current task
2. **Spec file**: `docs/specs/*.md` - understand requirements
3. **Architecture**: `docs/architecture/*.md` - understand design decisions

Mark your understanding in TodoWrite before proceeding.

## Step 3: Set Up Tracking

Use TodoWrite to break down the chunk into implementation steps:

1. Read the chunk description from the markdown file
2. Break it into concrete tasks (files to create/modify, tests to write)
3. Add all tasks to TodoWrite with status `pending`
4. Mark first task as `in_progress`

Keep TodoWrite updated as you work - this gives the user visibility into progress.

## During Implementation

### Track Discoveries

When you find something that's NOT your current task:

| Discovery | Action |
|-----------|--------|
| Bug | Add comment in chunks file: `<!-- BUG: description -->` |
| Tech debt | Add to "Discovered Issues" section in chunks file |
| Missing feature | Add to "Future Work" section in chunks file |
| Blocker | Stop and discuss with user immediately |
| Security issue | **FIX NOW** - escalate to user |

### Decision Points

When discovering issues, ask the user:
- "Found [issue]. Should I note it and continue, or address it now?"
- "This looks like scope creep. Want me to add it to the chunks file for later?"
- "This blocks our work. Should I switch focus?"

### Progress Updates

Keep TodoWrite in sync with reality:
- Mark tasks `in_progress` when starting
- Mark tasks `completed` immediately when done
- Add new tasks as discovered

## Quality Gate (Before Completing Chunk)

Before marking a chunk as complete in the markdown file, ask the user:

"Implementation looks complete. Before marking done:"
- **Quick review**: Visual scan, run tests, move on
- **Full /r5 review**: 5-pass deep review (recommended for complex/risky chunks)
- **Skip review**: Mark complete immediately (for trivial changes)

If user chooses /r5, run it and incorporate any findings before proceeding.

## Completing a Chunk

When chunk is done:

1. Update the chunks markdown file - check off the completed item:
   ```markdown
   - [x] Chunk description (was - [ ])
   ```

2. Add any discovered issues to the appropriate section

3. Commit the work:
   ```bash
   git status              # Review changes
   git add <files>         # Stage code
   git commit -m "..."     # Commit with descriptive message
   git push                # Push to remote
   ```

## Quick Reference

```bash
# Find work
# Open docs/breakdowns/*-chunks.md
# Look for unchecked items: - [ ]

# Track work
# Use TodoWrite for in-session tracking
# Update chunks.md for persistent tracking

# Note discoveries
# Add to chunks.md under "Discovered Issues" or "Future Work"

# Complete work
git add . && git commit -m "feat: description" && git push
```

## Anti-Patterns

- Working without reading the spec first
- Not using TodoWrite to track implementation steps
- Finding issues but not noting them anywhere
- Scope creep without user approval
- Ending session without git commit and push
- Forgetting to check off completed chunks in markdown
