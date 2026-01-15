---
description: Lightweight spec breakdown - checklist-based, no issue tracking
argument-hint: [spec file path]
---

# Lightweight Breakdown

Arguments: $ARGUMENTS

Break down a specification into implementation chunks using a simple checklist. No issue tracker required.

## Step 1: Load Context

**If $ARGUMENTS provided**: Read that file as the specification.
**If no arguments**:
```bash
ls docs/specs/ 2>/dev/null    # Available specs
```
Then ask "Which spec should I break down?"

Read the spec thoroughly before proceeding.

### Check Related Docs

```bash
ls docs/breakdowns/ 2>/dev/null      # Existing breakdowns?
ls docs/architecture/ 2>/dev/null    # Architecture to reference?
```

**If breakdown exists**: Ask "Update existing or start fresh?"

**If architecture exists**: Read it for:
- Tech stack decisions (don't re-decide)
- Component boundaries (inform chunking)
- Suggested domains (if any)

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

Analyze the spec for natural boundaries:

**Look for**:
- Distinct features or screens
- API endpoints / data models
- Services / utilities
- Integration points

**For each chunk, capture**:
- Title (clear, actionable)
- Goal (what "done" looks like)
- Scope (files/components)
- Dependencies (what must exist first)
- Size (S/M/L)
- Risk (flag if: new tech, complex algorithm, external integration, unclear requirements)

### Sizing Guidelines

| Size | Characteristics |
|------|-----------------|
| **S** | 1-2 files, < 1 hour, single concern |
| **M** | 3-5 files, 1-3 hours, one feature |
| **L** | 5-7 files, half-day, feature slice |

**Split if**: >7 files, multiple "done" states, context switch needed
**Merge if**: <30 min, no standalone value, tightly coupled

## Step 4: Order by Dependencies

Group chunks into phases based on dependencies (not fixed to 4 - use what fits):

```
Phase 1: No dependencies, can start immediately
Phase 2: Depends on Phase 1
Phase 3: Depends on Phase 2
...
```

**Common phase patterns**:
- Foundation → Core → Features → Polish (typical web app)
- Schema → Models → Services → API → UI (horizontal)
- Spike → Foundation → Build (risk-first)

### Parallel Work

Within each phase, note which chunks can run simultaneously:
```
Phase 2:
  ├── CHUNK-03 (can parallel with CHUNK-04)
  └── CHUNK-04 (can parallel with CHUNK-03)
```

Useful for multiple devs or context-switching between blocked work.

## Step 5: Write Breakdown

Save to `docs/breakdowns/<spec-name>-chunks.md`:

```markdown
# [Project] - Implementation Chunks

**Spec**: `docs/specs/<name>.md`
**Architecture**: `docs/architecture/<name>.md` (if exists)
**Created**: [date]
**Approach**: [Vertical/Horizontal/Risk-first]
**Target Session**: [Small/Medium/Large]

## Progress

- [ ] Phase 1: [Name] (X chunks)
- [ ] Phase 2: [Name] (X chunks)
- [ ] ...

## Phase 1: [Name]

### [ ] CHUNK-01: [Title]
**Goal**: [What "done" looks like]
**Scope**: [files/components]
**Size**: S/M/L
**Risk**: [None | ⚠️ reason]

### [ ] CHUNK-02: [Title]
...

## Phase 2: [Name]

### [ ] CHUNK-03: [Title] ← depends on CHUNK-01
**Goal**: ...
**Scope**: ...
**Size**: ...
**Parallel**: Can run with CHUNK-04

...

## Discovered During Implementation

Work found that wasn't in original scope:
- [ ] [description] - found while working on [chunk]

## Notes

[Context, decisions, learnings]
```

## Step 6: Wrap Up

```bash
mkdir -p docs/breakdowns
git add docs/breakdowns/
git commit -m "breakdown: chunks for [project]"
```

Display:
```
Breakdown complete!

Document: docs/breakdowns/<name>-chunks.md
Chunks: [N] total across [P] phases
Start with: CHUNK-01 ([title])

Workflow:
  1. Check off chunks as you complete them
  2. Update "Discovered" section for new work found
  3. Add notes as you learn things
```

## When to Use /chunks vs /breakdown

| Use `/chunks` | Use `/breakdown` |
|---------------|------------------|
| Solo developer | Team coordination needed |
| Simple tracking (checkboxes) | Need issue IDs, priorities, labels |
| Quick iteration | Formal project management |
| No beads setup | Beads integrated workflow |
| Small-medium project | Large/complex project |

## Pairing with Other Commands

```
/spec → /arch → /chunks → /impl     # Lightweight path
/spec → /architecture → /breakdown  # Full ceremony path
```

When using `/chunks`:
- Skip `/plan-to-beads` (no beads to create)
- Use `/impl` without issue ID, just describe the chunk
- Skip `/retro` or do informal progress check

## Anti-Patterns

- Chunks too granular (overhead exceeds value)
- No dependency ordering (blocked constantly)
- Not updating checkboxes (lose track of progress)
- Skipping the "Discovered" section (scope creep invisible)
- Ignoring architecture doc decisions
- Not flagging risky chunks (surprises during implementation)
- Fixed 4-phase structure when project doesn't fit it
