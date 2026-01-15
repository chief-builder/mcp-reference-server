---
description: Break down specification into implementation-ready chunks with beads tracking
---

# Specification Breakdown - Scrum Master Mode

Arguments: $ARGUMENTS

You are acting as a Scrum Master. Your job is to break down a specification document into right-sized, implementation-ready chunks, create beads issues for tracking, and establish a sustainable implementation cadence.

## Step 1: Load the Specification

**If $ARGUMENTS provided**: Read that file as the specification.
**If no arguments**: Ask the user:
- "Which specification document should I break down?"
- Suggest looking in `docs/specs/` or similar locations

Read the specification thoroughly before proceeding.

## Step 2: Check Existing State

Before creating new breakdown, check if this spec has been worked on before:

```bash
bd list --all | grep -i "<spec-keyword>"
bd stats
```

**If existing issues found**: Ask user:
- "Found existing issues related to this spec. Should I:"
  - "Review progress and continue (run /retro instead)"
  - "Start fresh (will archive old issues)"

## Step 3: Understand Scope & Constraints

Ask the user using AskUserQuestion:

### Session Size Preference
- **Small sessions** (1-2 hours): Fine-grained chunks, single component each
- **Medium sessions** (2-4 hours): Feature-sized chunks, may span 2-3 files
- **Large sessions** (half-day): Epic-sized chunks, complete feature slices

### Implementation Approach
- **Vertical slices**: Each chunk delivers end-to-end functionality (UI → API → DB)
- **Horizontal layers**: Group by architectural layer (all models first, then services, etc.)
- **Risk-first**: Tackle unknowns and spikes first, then build on proven foundation

### Current Codebase State
- **Greenfield**: Starting from scratch, need scaffolding first
- **Existing codebase**: Adding to established patterns
- **Mixed**: Some areas exist, some are new

## Step 3.5: Define Parallel Domains

Identify natural work streams that can run in parallel (useful for multiple agents or Claude Code instances).

### Discover Domains

1. **From the spec**: Look for distinct functional areas, data flows, pipelines, or component boundaries

2. **From existing code** (if not greenfield):
   ```bash
   ls -d */                    # Top-level directories
   find . -type f \( -name "*.py" -o -name "*.ts" -o -name "*.sql" \) | \
     sed 's|/[^/]*$||' | sort -u | head -20   # Directory patterns
   ```

3. **Suggest domains** to user using AskUserQuestion:
   ```
   "Based on the spec and codebase, I suggest these parallel domains:
    - [domain-a]: [reasoning]
    - [domain-b]: [reasoning]
    - cross-cutting: For work spanning multiple domains

   Adjust? (add/remove/rename)"
   ```

### Domain Guidelines

- **2-6 domains** is typical (too few = no parallelism benefit, too many = overhead)
- Domains should map to **independent file sets** to minimize merge conflicts
- Always include `cross-cutting` for config, docs, CI, and multi-domain work
- Examples by project type:
  | Project Type | Example Domains |
  |--------------|-----------------|
  | Web app | frontend, backend, database, cross-cutting |
  | ETL/dbt | sources, staging, marts, tests, cross-cutting |
  | CLI tool | parsing, commands, output, cross-cutting |
  | ML pipeline | data-prep, training, inference, cross-cutting |
  | Monorepo | pkg-a, pkg-b, shared, cross-cutting |

Store the agreed domains for use in Step 6 (issue creation) and the breakdown doc.

## Step 4: Identify Natural Boundaries

Analyze the specification for:

### Features & Components
- Major functional areas
- UI views/screens
- API endpoints
- Data models
- Services/utilities

### Dependencies
- Which components must exist before others can be built?
- What's the critical path?
- Are there independent tracks that can parallelize?

### Risk Areas
- New technologies or integrations
- Complex algorithms
- Third-party dependencies
- Performance-critical sections

## Step 5: Create Implementation Chunks

For each chunk, define:

| Field | Description |
|-------|-------------|
| **ID** | Short identifier (e.g., `CHUNK-01`) |
| **Title** | Descriptive name |
| **Domain** | Which parallel domain (from Step 3.5) |
| **Goal** | What's "done" for this chunk |
| **Scope** | Files/components included |
| **Inputs** | What must exist before starting |
| **Outputs** | What this chunk produces for others |
| **Size** | S/M/L relative to session preference |
| **Risk** | Low/Medium/High |
| **Beads ID** | Will be filled after issue creation |

### Chunk Sizing Rules

**Too Big** (split it):
- Touches more than 5-7 files
- Has multiple distinct "done" states
- Mixes unrelated concerns
- Would require context switch mid-implementation

**Too Small** (merge it):
- Single function or minor change
- No clear "done" state on its own
- Tightly coupled to another chunk
- Less than 30 minutes of work

**Just Right**:
- Clear, testable outcome
- Self-contained context
- Can be completed without interruption
- Natural commit boundary

## Step 6: Create Beads Issues

Create a parent epic for the spec, then create task issues for each chunk:

```bash
# Create the epic
bd create "[Spec Name] Implementation" \
  --type=epic \
  --priority=2 \
  -d "Full spec: docs/specs/<name>.md | Breakdown: docs/breakdowns/<name>-breakdown.md"

# For each chunk (example) - include domain label
bd create "CHUNK-01: [Title]" \
  --type=task \
  --priority=<0-4> \
  --parent=<epic-id> \
  --label=<domain> \
  -d "Goal: [goal]. Scope: [files]. See breakdown doc for details."
```

**Label assignment**: Use the domain that best matches the chunk's scope. If a chunk spans multiple domains, use `cross-cutting`.

After creating all issues, set up dependencies:

```bash
# Example: CHUNK-03 depends on CHUNK-01
bd dep add <chunk-03-id> <chunk-01-id>
```

## Step 7: Write the Breakdown Document

Save the breakdown to: `docs/breakdowns/<spec-name>-breakdown.md`

### Breakdown Document Template

```markdown
# [Spec Name] - Implementation Breakdown

**Source Spec**: `docs/specs/<name>.md`
**Created**: [date]
**Last Updated**: [date]
**Epic Issue**: `<epic-id>`

## Configuration

| Setting | Value |
|---------|-------|
| Session Size | [Small/Medium/Large] |
| Approach | [Vertical/Horizontal/Risk-first] |
| Total Chunks | [N] |
| Domains | [domain-a, domain-b, ..., cross-cutting] |

## Domain Definitions

| Domain | Description | Typical Scope |
|--------|-------------|---------------|
| [domain-a] | [What this domain covers] | [directories/file patterns] |
| [domain-b] | [What this domain covers] | [directories/file patterns] |
| cross-cutting | Work spanning multiple domains | Config, docs, CI, shared utils |

## Progress Summary

| Status | Count |
|--------|-------|
| Completed | 0 |
| In Progress | 0 |
| Pending | [N] |
| Discovered (Unplanned) | 0 |

## Dependency Graph

```
Phase 1 (Foundation):
  ├── CHUNK-01 [ID:xxx] - [Title]
  └── CHUNK-02 [ID:xxx] - [Title]

Phase 2 (Core):
  ├── CHUNK-03 [ID:xxx] ──depends──▶ CHUNK-01
  └── CHUNK-04 [ID:xxx] ──depends──▶ CHUNK-02
```

## Implementation Chunks

### CHUNK-01: [Title]
- **Beads ID**: `<issue-id>`
- **Domain**: [domain label]
- **Status**: pending
- **Goal**: [What "done" looks like]
- **Scope**: [Files/components]
- **Inputs**: None (foundation)
- **Outputs**: [What this produces]
- **Size**: [S/M/L]
- **Risk**: [Low/Med/High]
- **Notes**: [Special considerations]

### CHUNK-02: [Title]
...

## Discovered Issues Log

Issues found during implementation that weren't in original scope:

| Date | Issue ID | Title | Impact on Breakdown |
|------|----------|-------|---------------------|
| - | - | - | - |

## Retrospective Notes

[Updated after each /retro session]
```

## Step 8: Present to User

Show the user:
1. Summary: chunk count, phases, epic ID
2. Dependency graph
3. Recommended first chunk
4. Any blocking questions

### Quality Review (Optional)

For complex specs, suggest:
- "This is a substantial breakdown. Run /r5 to review the chunking strategy?"
- Especially recommended when: high-risk items, unfamiliar domain, many dependencies

Display quick reference:

```
Breakdown complete! Issue tracking is set up.

Quick Commands:
  bd ready              # See what's available to work on
  bd show <epic-id>     # View the full epic
  bd list --parent=<id> # List all chunks

Next Steps:
  1. Pick a chunk:     bd show <chunk-id>
  2. Plan it:          /plan [chunk description]
  3. Create sub-tasks: /plan-to-beads
  4. Implement:        /clear && /impl <chunk-id>
  5. Review progress:  /retro
```

## Anti-Patterns

- Creating chunks without beads issues (no tracking)
- Ignoring dependencies (leads to blocked work)
- Making chunks too granular (death by context switching)
- Not updating breakdown doc after changes
- Skipping /retro (scope drift goes unnoticed)
