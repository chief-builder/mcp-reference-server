---
description: Review progress, incorporate discovered issues, update breakdown (Scrum Master retrospective)
---

# Retrospective - Scope & Progress Review

Arguments: $ARGUMENTS

You are acting as a Scrum Master conducting a retrospective. Review implementation progress, incorporate newly discovered issues, and update the breakdown to reflect current reality.

## Step 1: Load Context

**If $ARGUMENTS provided**: Use that as the breakdown file path.
**If no arguments**:
1. Look for recent breakdown files in `docs/breakdowns/`
2. Ask user which project to review

**If breakdown doc exists**:
- Read it to understand the original plan
- Extract domains from Configuration table
- Use chunk-based progress tracking

**If no breakdown** (ad-hoc workflow / label-only mode):
- Read domains from beads labels directly:
  ```bash
  bd list --all   # Extract unique labels from output
  ```
- Skip chunk-based progress (no baseline to compare)
- Skip "Discovered Issues" comparison
- Use label-based progress only (Step 4.5)

## Step 2: Gather Current State

Run these commands to understand progress:

```bash
# Overall project health
bd stats

# What's completed
bd list --status=closed

# What's in progress
bd list --status=in_progress

# What's blocked
bd blocked

# What's ready to start
bd ready

# Recently created issues (discovered during impl)
bd list --all --sort=created | head -20
```

## Step 3: Identify Discovered Issues

Compare current beads state against original breakdown:

### Categorize New Issues

Issues created during implementation that weren't in the original breakdown:

| Category | Description | Action |
|----------|-------------|--------|
| **Scope Expansion** | New features that emerged | Evaluate: needed for MVP? |
| **Technical Debt** | Shortcuts taken, cleanup needed | Add to backlog, prioritize |
| **Bugs** | Defects found during work | Fix now or schedule |
| **Blockers** | Issues preventing progress | Immediate attention |
| **Dependencies** | External needs discovered | Update dependency graph |

### For Each Discovered Issue, Ask:

Using AskUserQuestion:
- "Issue `<id>`: [title] - Does this affect the remaining breakdown?"
  - **Yes, blocks existing chunk** → Update dependencies
  - **Yes, requires new chunk** → Create and insert in breakdown
  - **No, independent work** → Keep in backlog, don't affect breakdown
  - **Should be descoped** → Close or defer

## Step 4: Update Progress Summary

Calculate and display (if breakdown doc exists):

```
Progress Report: [Project Name]
═══════════════════════════════════════════════════════

Original Chunks:     [N]
├── Completed:       [X] (XX%)
├── In Progress:     [Y]
├── Pending:         [Z]
└── Blocked:         [B]

Discovered Issues:   [D]
├── Incorporated:    [I] (added to breakdown)
├── Backlog:         [L] (deferred)
└── Closed:          [C] (resolved or descoped)

Scope Change:        [+/-N] chunks from original
Velocity:            [X] chunks completed since last retro

═══════════════════════════════════════════════════════
```

## Step 4.5: Progress by Domain

If domains are defined (from breakdown or beads labels), show progress grouped by domain:

```bash
# For each domain, count closed vs total issues
bd list --label=<domain> --status=closed | wc -l
bd list --label=<domain> --all | wc -l
```

Display as:
```
Progress by Domain:
═══════════════════════════════════════════════════════
  domain-a:      ████████░░ 80%  (8/10)
  domain-b:      ████░░░░░░ 40%  (4/10)
  cross-cutting: ██░░░░░░░░ 20%  (1/5)
═══════════════════════════════════════════════════════
```

This view helps:
- Identify bottlenecks (domains lagging behind)
- Plan parallel agent allocation
- Spot domains ready for additional resources

**In label-only mode** (no breakdown): This is the primary progress view.

## Step 5: Identify Blockers & Risks

Check for:

### Blocked Work
```bash
bd blocked
```
For each blocked item:
- What's blocking it?
- Can the blocker be resolved quickly?
- Should we reprioritize around it?

### Stale In-Progress
Issues that have been in_progress for too long:
- Are they stuck?
- Should they be split?
- Is the chunk too big?

### Quality Check
For recently completed chunks, ask:
- "Was /r5 run before closing? If not, any concerns about quality?"
- Flag chunks closed without review for potential revisit

### Risk Assessment Changes
- Did any "Low risk" items turn out harder than expected?
- Did any spikes reveal new risks?
- Are estimates still realistic?

## Step 6: Replan If Needed

Ask the user:
- "Based on discoveries and progress, should we adjust the plan?"

### Replanning Options

**Minor Adjustments** (update breakdown doc only):
- Reorder remaining chunks
- Add/remove dependencies
- Update risk levels
- Adjust size estimates

**Significant Changes** (requires new chunks):
- Create new beads issues for new chunks
- Update breakdown doc with new chunk details
- Recalculate dependency graph

**Major Pivot** (significant scope change):
- Consider re-running /breakdown with updated spec
- Archive completed work
- Start fresh breakdown from current state

## Step 7: Update Breakdown Document

Edit the breakdown file to reflect:

1. **Progress Summary table**: Update counts
2. **Chunk statuses**: Mark completed, note blockers
3. **Discovered Issues Log**: Add new entries
4. **Retrospective Notes**: Add dated entry

### Retrospective Notes Entry Template

```markdown
## Retrospective Notes

### [Date] Retro

**Progress**: Completed chunks [list]. In progress: [list].

**Discoveries**:
- [Issue ID]: [Title] - [How it affects plan]

**Adjustments Made**:
- [Change description]

**Next Focus**:
- [Recommended next chunks]

**Blockers/Risks**:
- [Any concerns]
```

## Step 8: Recommend Next Actions

Based on the retro, suggest:

```
Recommended Next Steps:
───────────────────────────────────────

1. IMMEDIATE (blockers/bugs):
   - [ ] Fix <issue-id>: [title]

2. READY TO START:
   - [ ] CHUNK-XX (<issue-id>): [title]
   - [ ] CHUNK-YY (<issue-id>): [title]

3. BACKLOG ITEMS TO CONSIDER:
   - [ ] <issue-id>: [title] - [why it might matter]

Quick Commands:
   bd show <issue-id>      # Details on any issue
   /plan <chunk desc>      # Start planning next chunk
   /impl <issue-id>        # Start implementation
```

## Step 9: Sync State

Ensure everything is persisted:

```bash
bd sync                   # Sync beads state
git add docs/breakdowns/  # Stage breakdown updates
git commit -m "retro: update breakdown after progress review"
git push
```

## When to Run /retro

- After completing a chunk (before starting next)
- When feeling lost about project state
- After discovering significant new issues during /impl
- At regular intervals (e.g., end of day, end of week)
- When blocked and unsure how to proceed

## Anti-Patterns

- Skipping retros (scope drift accumulates silently)
- Not updating breakdown doc (plan diverges from reality)
- Ignoring discovered issues (technical debt grows)
- Replanning too frequently (thrashing)
- Not replanning when clearly needed (stubbornness)

## Quick Reference

```bash
# Progress check
bd stats && bd ready

# See what's new since last retro
bd list --all --sort=created

# Update an issue
bd update <id> --status=closed

# Full retrospective
/retro docs/breakdowns/<name>-breakdown.md
```
