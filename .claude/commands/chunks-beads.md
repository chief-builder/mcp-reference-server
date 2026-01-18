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
- Goal (one-line summary of intent)
- Done When (explicit acceptance criteria - what must be true to close this chunk)
- Scope (files/components)
- Dependencies (what must exist first)
- Size: S (< 1hr), M (1-3hr), L (half-day)
- Risk: None | reason

### Writing "Done When" Criteria

Each chunk MUST have clear, verifiable acceptance criteria that the **chunk-auditor** can verify. Use this format:

```
Done When:
- [ ] [Observable outcome 1]
- [ ] [Observable outcome 2]
- [ ] Validation passes (typecheck, lint, build)
- [ ] Discovered issues filed to beads
```

**Note:** "Validation passes" is the default. Add explicit test criteria only for business logic, API endpoints, or critical flows.

### Criteria Quality Checklist

Each criterion MUST be:
- **Testable**: Can verify by running code, checking output, or viewing behavior
- **Specific**: No ambiguity (avoid "works correctly", "is functional", "handles errors")
- **Observable**: Clear success signal (file exists, test passes, endpoint returns X)
- **Auditable**: The chunk-auditor agent can verify it programmatically

**BAD criteria** (vague, unverifiable):
```
- [ ] Works correctly
- [ ] Handles edge cases
- [ ] Is well-tested
- [ ] Follows best practices
```

**GOOD criteria** (specific, auditable):
```
- [ ] Function returns empty array when input is null
- [ ] 404 response includes "resource not found" message
- [ ] Component renders loading spinner while fetching
- [ ] All tests in user.test.ts pass
```

### Criteria Categories

Generate criteria in these categories for completeness:

| Category | What to verify | Example |
|----------|---------------|---------|
| **Functional** | Core behavior works | "POST /users creates user and returns 201" |
| **Integration** | Connects to existing code | "Uses AuthService for token validation" |
| **Validation** | Typecheck, lint, build pass | "Validation passes" |
| **Edge cases** | Handles boundaries | "Empty list shows 'No items' message" |
| **Tests** | Only when high-value | "Unit tests for auth edge cases" (business logic only) |
| **Tracking** | Work is documented | "Discovered issues filed to beads" |

### Examples

```
# API endpoint chunk (business logic → tests required)
Done When:
- [ ] GET /api/users returns paginated user list with max 20 items
- [ ] POST /api/users creates user and returns 201 with user object
- [ ] POST /api/users with invalid email returns 400 with "invalid email" error
- [ ] Missing auth token returns 401
- [ ] Validation passes
- [ ] Integration tests for success/error cases
- [ ] Discovered issues filed to beads

# UI component chunk (no new tests, just validation)
Done When:
- [ ] UserList component renders in src/components/UserList.tsx
- [ ] Displays name and email columns in table format
- [ ] Click on row calls onSelect prop with user id
- [ ] Empty state shows "No users found" message
- [ ] Loading state shows spinner component
- [ ] Validation passes
- [ ] Discovered issues filed to beads

# Refactoring chunk (don't break existing tests)
Done When:
- [ ] Old getUserById function removed from src/api/users.ts
- [ ] New getUser function exported from src/services/user-service.ts
- [ ] All callers updated (grep shows 0 references to getUserById)
- [ ] Validation passes
- [ ] Existing tests still pass
- [ ] Discovered issues filed to beads
```

**Split if**: >7 files, multiple "done" states, or criteria span unrelated behaviors
**Merge if**: <30 min, no standalone value

## Step 4: Order by Dependencies

### Automatic Dependency Detection

Before ordering chunks, analyze for **implicit dependencies** that may not be obvious:

**Scan for dependency signals:**

```bash
# For each chunk's scope files, search for imports/references to other chunks' files
grep -r "import.*from" src/  # Find import statements
grep -r "require(" src/      # Find CommonJS requires
```

**Dependency types to detect:**

| Type | Signal | Example |
|------|--------|---------|
| **Import/Module** | Chunk B imports from files Chunk A creates | `import { User } from './models/user'` |
| **Data** | Chunk B needs types/schemas Chunk A defines | Interface defined in Chunk A, used in Chunk B |
| **API** | Chunk B calls endpoints/functions Chunk A implements | `await api.getUsers()` calling Chunk A's endpoint |
| **Test** | Chunk B's tests require Chunk A's fixtures/mocks | Test file imports from Chunk A's test utils |
| **Config** | Chunk B needs configuration Chunk A sets up | Database connection, env vars, routes |

**Detection process:**

1. List all files in each chunk's scope
2. For each chunk, grep for references to other chunks' files:
   ```bash
   # Example: Check if CHUNK-03 files reference CHUNK-01 files
   grep -l "user-model\|UserModel\|/models/user" [CHUNK-03 scope files]
   ```
3. If references found, suggest dependency

**Auto-suggest format:**

```
Detected dependency: CHUNK-03 → CHUNK-01
  Reason: src/services/user-service.ts imports from src/models/user.ts
  CHUNK-03 (User Service) cannot start until CHUNK-01 (User Model) is complete.

  Add this dependency? [Yes/No]
```

### Group into Phases

After resolving dependencies:

```
Phase 1: No dependencies, can start immediately
Phase 2: Depends on Phase 1
Phase 3: Depends on Phase 2
...
```

**Parallel opportunities**: Chunks in the same phase with non-overlapping scopes can run in parallel.

```
Phase 2:
  ├── CHUNK-03: User Service (depends on CHUNK-01)     ┐
  │                                                     ├─ Can run in parallel
  └── CHUNK-04: Auth Middleware (depends on CHUNK-02)  ┘
```

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
**Goal**: [One-line summary of intent]
**Done When**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] Tests pass / No regressions

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
bd create "CHUNK-01: [Title]" --type=task --priority=2 --label=[spec-name] -d "[Goal]

Done When:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] Tests pass

Scope: [files]. Size: [S/M/L]"

# Phase 2+ chunks (with dependencies)
bd create "CHUNK-03: [Title]" --type=task --priority=2 --label=[spec-name] -d "[Goal]

Done When:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] Tests pass

Scope: [files]. Size: [S/M/L]"

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
| Goal | Description (first line) |
| Done When | Description (acceptance criteria checklist) |
| Scope + Size | Description (footer info) |
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
- Vague "Done When" criteria (e.g., "works correctly" - not verifiable)
