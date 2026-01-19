---
description: Quick bug fix or simple feature - track without full ceremony
argument-hint: <short description>
---

# Quick

Arguments: $ARGUMENTS

Lightweight workflow for bugs and simple features. Tracks in beads without full SDLC ceremony.

## Step 1: Clarify Type

Use AskUserQuestion:

**Q: What type of work is this?**
- **Bug/fix** - Something broken that needs fixing → `--type=bug`
- **Feature** - New functionality to add → `--type=task`

## Step 2: Create Issue

Generate a label: `{project}-{slug}`
- **project**: Current repo/directory name (e.g., `my-ai-chat`)
- **slug**: Derive from user's request - 2-4 words, kebab-case, descriptive (e.g., `delete-confirm`, `sidebar-padding`, `auth-bug`)

```bash
bd create "$ARGUMENTS" --type=[bug|task] --priority=2 --label={project}-{slug}
bd sync
```

Confirm: "Tracking as #[id] with label `{label}`. Let's do it."

## Step 3: Understand

Quick clarification if needed:
- What exactly needs to happen?
- Where does it go? (file, component, location)
- Any constraints?

Skip if requirements are already clear from $ARGUMENTS.

## Step 4: Implement

Work directly. No subagents, no chunks. Just do it.

After each change, briefly state what you changed so user can verify.

## Step 5: Before Closing

```
Quick check:
- [ ] Done (bug fixed or feature works)
- [ ] Related functionality still works
- [ ] Validation passes
```

Ask user: "Does it work? Anything else affected?"

## Step 6: Close

```bash
bd update <id> -d "$ARGUMENTS

## What Changed
[Summary of changes]

## Files
[List of modified files]"

bd close <id>
git add -A && git commit -m "[fix|feat]: $ARGUMENTS

Closes beads#[id]"
bd sync
```

Done.

## When to Use

| `/quick` | Full SDLC (/spec → /arch → /chunks-beads → /auto) |
|----------|---------------------------------------------------|
| Clear requirements | Unclear/evolving requirements |
| Single focus | Multi-component work |
| No arch decisions needed | Needs architecture decisions |
| < 1 hour | Multiple chunks of work |
| Bug fixes | |
| Small features | |
