---
description: Spec breakdown with beads integration - enables /auto workflow
argument-hint: [spec file path]
---

# Chunks with Beads Integration

Arguments: $ARGUMENTS

Break down a specification into implementation chunks AND create beads issues for autonomous execution with `/auto`.

## Step 1: Load Context

**If $ARGUMENTS provided**: Read that file as the specification.
**If no arguments**:
```bash
ls docs/specs/ 2>/dev/null
```
Then ask "Which spec should I break down?"

Read the spec thoroughly before proceeding.

### Check Related Docs

```bash
ls docs/breakdowns/ 2>/dev/null
ls docs/architecture/ 2>/dev/null
```

**If breakdown exists**: Ask "Update existing or start fresh?"

**If architecture exists**: Read it for:
- Tech stack decisions (don't re-decide)
- Component boundaries (inform chunking)

## Step 2: Quick Scoping

Use AskUserQuestion (single call, two questions):

**Q1: Session size preference?**
- Small (1-2 hrs): Fine-grained, single component
- Medium (2-4 hrs): Feature-sized, 2-3 files
- Large (half-day): Complete feature slices

**Q2: Implementation approach?**
- Vertical: End-to-end slices (UI → API → DB)
- Horizontal: Layer by layer (models → services → API)
- Risk-first: Unknowns first, then build on proven foundation

## Step 3: Identify Chunks

Analyze the spec for natural boundaries.

**For each chunk, capture**:
- Title (clear, actionable)
- Goal (what "done" looks like)
- Scope (files/components)
- Dependencies (what must exist first)
- Size: S (< 1hr), M (1-3hr), L (half-day)
- Risk: None | reason

**Split if**: >7 files, multiple "done" states
**Merge if**: <30 min, no standalone value

## Step 4: Order by Dependencies

Group into phases:
```
Phase 1: No dependencies, can start immediately
Phase 2: Depends on Phase 1
...
```

Note parallel opportunities within each phase.

## Step 5: Write Breakdown

Save to `docs/breakdowns/<spec-name>-chunks.md`:

```markdown
# [Project] - Implementation Chunks

**Spec**: `docs/specs/<name>.md`
**Architecture**: `docs/architecture/<name>.md`
**Created**: [date]
**Approach**: [Vertical/Horizontal/Risk-first]
**Beads**: Integrated (use /auto to implement)

## Progress

- [ ] Phase 1: [Name] (X chunks)
- [ ] Phase 2: [Name] (X chunks)
...

## Phase 1: [Name]

### [ ] CHUNK-01: [Title]
**Goal**: [What "done" looks like]
**Scope**: [files/components]
**Size**: S/M/L
**Risk**: [None | reason]
**Beads**: #[issue-id]

### [ ] CHUNK-02: [Title]
...

## Discovered During Implementation

- [ ] [description] - found while working on [chunk]

## Notes

[Context, decisions, learnings]
```

## Step 6: Create Beads Issues

### Sync and Check for Existing

```bash
bd sync
bd list --all | grep "CHUNK-"   # Check for existing chunk issues
```

**If chunk issues already exist for this project:**
Ask user: "Found existing chunk issues. Options:"
- **Update**: Match by CHUNK-XX number, update descriptions
- **Add new only**: Skip existing, create only new chunks
- **Recreate**: Close all existing, create fresh
- **Abort**: Exit without changes

### Create Issues with Project Label

Use spec name as label for project isolation (enables `/auto --label=<name>`):

```bash
# Phase 1 chunks (no dependencies)
bd create "CHUNK-01: [Title]" --type=task --priority=2 --label=[spec-name] -d "[Goal]. Scope: [files]. Size: [S/M/L]"

# Phase 2+ chunks (with dependencies)
bd create "CHUNK-03: [Title]" --type=task --priority=2 --label=[spec-name] -d "[Goal]. Scope: [files]. Size: [S/M/L]"

# Add dependency: CHUNK-03 depends on CHUNK-01 (CHUNK-03 cannot start until CHUNK-01 is done)
bd dep add [CHUNK-03-id] [CHUNK-01-id]
```

### Priority Mapping

| Risk | Priority |
|------|----------|
| None | 2 (normal) |
| Risky/Unknown | 1 (high) - tackle early |

### After Creating All Issues

```bash
bd sync                    # Persist to git
bd stats                   # Show overview
bd ready                   # Show what's ready to start
```

Update the chunks.md file with issue IDs in the `**Beads**: #[id]` field.

## Step 7: Commit Everything

```bash
git add docs/breakdowns/ .beads/
git commit -m "breakdown: chunks with beads for [project]"
git push
```

## Step 8: Summary

Display:
```
Breakdown complete!

Project label: [spec-name]
Document: docs/breakdowns/<name>-chunks.md
Chunks: [N] total across [P] phases
Beads issues: [N] created

Ready to start:
  [list from bd ready --label=<spec-name>]

To implement autonomously:
  /auto --label=[spec-name]

To implement manually:
  bd ready --label=[spec-name]   # See available work
  /impl [issue-id]               # Work on specific issue
```

## Chunk to Beads Mapping

| Chunk Field | Beads Field |
|-------------|-------------|
| Title | Issue title |
| Goal + Scope + Size | Description |
| Size S/M/L | (informational in description) |
| Risk flag | Priority 1 (high) vs 2 (normal) |
| Dependencies | `bd dep add` |
| Phase | (implicit via dependencies) |

## Anti-Patterns

- Creating issues without `--label=[spec-name]` (breaks project isolation)
- Creating issues without dependencies (loses ordering)
- Not checking for existing issues first (creates duplicates)
- Not syncing beads before and after
- Forgetting to update chunks.md with issue IDs
- Too granular chunks (overhead exceeds value)
- Not flagging risky chunks with priority 1
