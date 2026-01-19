---
description: Comprehensive test suite analysis and gap identification
argument-hint: [directory or "." for all]
model: opus
---

# Test Suite Audit

Arguments: $ARGUMENTS

Analyze test infrastructure, run all test tiers, parse coverage, and identify gaps.

## Step 1: Determine Scope

**If $ARGUMENTS provided**: Focus on that directory.
**If no arguments**: Audit entire project.

```bash
TARGET="${ARGUMENTS:-.}"
```

## Step 2: Detect Test Infrastructure

### Node.js / TypeScript

```bash
# Test framework detection
grep -l "vitest\|jest\|mocha\|ava\|tap" package.json 2>/dev/null
cat package.json | grep -E "vitest|jest|mocha|ava" | head -5

# Config files
ls vitest.config.* jest.config.* mocha*.json .mocharc* 2>/dev/null

# Test scripts
cat package.json | grep -A5 '"test'
```

### Python

```bash
# pytest
ls pytest.ini pyproject.toml setup.cfg 2>/dev/null | xargs grep -l "\[pytest\]\|\[tool.pytest\]" 2>/dev/null
pip show pytest 2>/dev/null | head -3

# unittest
grep -r "import unittest" . --include="*.py" 2>/dev/null | head -3

# Coverage
pip show coverage pytest-cov 2>/dev/null | head -5
```

### Rust

```bash
# Cargo test (built-in)
grep -l "\[dev-dependencies\]" Cargo.toml 2>/dev/null
cat Cargo.toml | grep -A10 "\[dev-dependencies\]"
```

### Go

```bash
# go test (built-in)
find . -name "*_test.go" 2>/dev/null | head -5

# Coverage setup
grep "cover" Makefile 2>/dev/null
```

### Other

```bash
# Java
ls pom.xml 2>/dev/null && grep -A5 "surefire\|junit" pom.xml 2>/dev/null | head -10

# .NET
ls *.csproj 2>/dev/null && grep -i "test\|xunit\|nunit" *.csproj 2>/dev/null | head -10

# Ruby
ls Gemfile 2>/dev/null && grep "rspec\|minitest" Gemfile 2>/dev/null
```

Record detected framework(s).

## Step 3: Analyze Test Structure

### Find Test Files

```bash
# By naming convention
find $TARGET -type f \( -name "*.test.*" -o -name "*.spec.*" -o -name "test_*" -o -name "*_test.*" \) 2>/dev/null | wc -l

# By directory
find $TARGET -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "spec" \) 2>/dev/null

# List test files
find $TARGET -type f \( -name "*.test.*" -o -name "*.spec.*" -o -name "test_*" -o -name "*_test.*" \) 2>/dev/null | head -30
```

### Categorize by Tier

```bash
# Unit tests (usually in test/unit, __tests__, or co-located)
find $TARGET -path "*unit*" -name "*.test.*" 2>/dev/null | wc -l
find $TARGET -path "*unit*" -name "*.spec.*" 2>/dev/null | wc -l

# Integration tests
find $TARGET -path "*integration*" -name "*.test.*" 2>/dev/null | wc -l

# E2E tests
find $TARGET -path "*e2e*" -name "*.test.*" 2>/dev/null | wc -l
find $TARGET -path "*e2e*" -name "*.spec.*" 2>/dev/null | wc -l

# By file naming patterns
ls test/unit/ tests/unit/ 2>/dev/null | wc -l
ls test/integration/ tests/integration/ 2>/dev/null | wc -l
ls test/e2e/ tests/e2e/ e2e/ 2>/dev/null | wc -l
```

### List Test Suites

```bash
# Extract describe/test blocks
grep -rh "describe(\|it(\|test(" $TARGET --include="*.test.*" --include="*.spec.*" 2>/dev/null | head -50

# Python test classes and methods
grep -rh "class Test\|def test_" $TARGET --include="*.py" 2>/dev/null | head -50
```

## Step 4: Run All Test Tiers

Execute tests and capture results. Continue on failure.

### Node.js

```bash
# All tests
npm test 2>&1 | tee /tmp/test-output.txt

# By tier if scripts exist
npm run test:unit 2>&1 || echo "No unit test script"
npm run test:integration 2>&1 || echo "No integration test script"
npm run test:e2e 2>&1 || echo "No e2e test script"

# With coverage if available
npm run test:coverage 2>&1 || npm test -- --coverage 2>&1 || echo "No coverage configured"
```

### Python

```bash
# pytest with coverage
pytest --cov=$TARGET --cov-report=term-missing 2>&1 | tee /tmp/test-output.txt

# Or basic pytest
pytest 2>&1 | tee /tmp/test-output.txt

# Fallback to unittest
python -m unittest discover 2>&1
```

### Rust

```bash
cargo test 2>&1 | tee /tmp/test-output.txt

# With coverage (if tarpaulin installed)
cargo tarpaulin 2>&1 || echo "No coverage tool"
```

### Go

```bash
go test ./... -v 2>&1 | tee /tmp/test-output.txt

# With coverage
go test ./... -coverprofile=coverage.out 2>&1
go tool cover -func=coverage.out 2>/dev/null
```

Parse output for: total, passed, failed, skipped, duration.

## Step 5: Parse Coverage

If coverage data available:

### Node.js (Istanbul/c8/v8)

```bash
# Look for coverage output
cat coverage/coverage-summary.json 2>/dev/null
cat coverage/lcov-report/index.html 2>/dev/null | grep -o "[0-9]*\.[0-9]*%" | head -5
```

### Python (coverage.py)

```bash
coverage report 2>/dev/null
cat .coverage 2>/dev/null
```

### Go

```bash
go tool cover -func=coverage.out 2>/dev/null | tail -1
```

Extract:
- Line coverage %
- Branch coverage % (if available)
- Per-file breakdown (top 10 lowest)

## Step 6: Identify Gaps

### Files Without Tests

```bash
# Source files
find src -name "*.ts" -o -name "*.js" 2>/dev/null | while read f; do
  base=$(basename "$f" .ts)
  base=$(basename "$base" .js)
  test_exists=$(find . -name "*$base*test*" -o -name "*$base*spec*" 2>/dev/null | head -1)
  [ -z "$test_exists" ] && echo "NO TEST: $f"
done | head -20

# Python
find . -name "*.py" -not -path "*test*" 2>/dev/null | while read f; do
  base=$(basename "$f" .py)
  test_exists=$(find . -name "test_$base*" -o -name "*${base}_test*" 2>/dev/null | head -1)
  [ -z "$test_exists" ] && echo "NO TEST: $f"
done | head -20
```

### Uncovered Functions

From coverage report, identify functions/methods with 0% coverage.

### Test Quality Issues

```bash
# Tests with no assertions
grep -rL "expect\|assert\|should\|toBe\|toEqual" $TARGET --include="*.test.*" 2>/dev/null | head -10

# Empty test blocks
grep -rn "it(\|test(" $TARGET --include="*.test.*" 2>/dev/null | grep -v "expect\|assert" | head -10

# Skipped tests
grep -rn "\.skip\|xit(\|xdescribe(\|@skip\|@pytest.mark.skip" $TARGET 2>/dev/null | head -10
```

## Step 7: Generate Report

Create `docs/test-audit-report.md`:

```markdown
# Test Audit Report

**Generated**: [date]
**Scope**: [target directory]

## Summary

| Metric | Value |
|--------|-------|
| Test Framework | [Vitest/Jest/pytest/etc] |
| Total Test Files | [N] |
| Total Tests | [N] |
| Passed | [N] |
| Failed | [N] |
| Skipped | [N] |
| Duration | [time] |
| Line Coverage | [X%] |

## Test Infrastructure

### Framework
- **Name**: [framework]
- **Version**: [version]
- **Config**: [config file path]

### Coverage Tool
- **Name**: [istanbul/c8/coverage.py/etc]
- **Configured**: [yes/no]

## Test Distribution

| Tier | Count | Status |
|------|-------|--------|
| Unit | [N] | [all pass / X failing] |
| Integration | [N] | [all pass / X failing] |
| E2E | [N] | [all pass / X failing] |

## Coverage Analysis

### Overall
- Lines: [X%]
- Branches: [X%] (if available)
- Functions: [X%] (if available)

### Lowest Coverage Files

| File | Line % | Note |
|------|--------|------|
| [file1] | [X%] | [comment] |
| [file2] | [X%] | [comment] |

## Gaps Identified

### Files Without Tests

| File | Lines | Priority |
|------|-------|----------|
| [file] | [N] | [High/Medium/Low] |

### Uncovered Functions

| File | Function | Reason |
|------|----------|--------|
| [file] | [fn] | [no test / partial] |

### Skipped Tests

| Test | Reason | Action |
|------|--------|--------|
| [test name] | [skip reason if any] | [fix / remove] |

### Test Quality Issues

- [N] tests without assertions
- [N] empty test blocks
- [N] tests with console.log (should be removed)

## Failing Tests

| Test | Error | Suggested Fix |
|------|-------|---------------|
| [test name] | [error message] | [suggestion] |

## Recommendations

### Critical (Block Release)
1. [issue that must be fixed]

### High Priority
1. [important gap to address]

### Nice to Have
1. [improvement suggestion]

## Commands Reference

```bash
# Run all tests
[command]

# Run with coverage
[command]

# Run specific tier
[command]
```
```

## Step 8: Optional Beads Integration

Ask user: "Should I file test gaps as beads issues?"

**If yes**:
```bash
bd sync

# Critical gaps
bd create "Add tests for [file]" --type=task --priority=1 --label=test-gap -d "File has no test coverage. Lines: [N]"

# Normal gaps
bd create "Improve coverage for [file]" --type=task --priority=2 --label=test-gap -d "Current coverage: [X%]. Target: 80%"

# Failing tests
bd create "Fix failing test: [name]" --type=bug --priority=1 --label=test-fix -d "[error message]"

bd sync
```

## Step 9: Save and Commit

```bash
mkdir -p docs
git add docs/test-audit-report.md
git commit -m "docs: test audit report"
```

## Step 10: Summary

Display:
```
Test audit complete!

Framework: [name]
Total tests: [N] ([passed] passed, [failed] failed, [skipped] skipped)
Coverage: [X%]

Gaps found:
- [N] files without tests
- [N] uncovered functions
- [N] skipped tests
- [N] failing tests

Report: docs/test-audit-report.md
[If beads]: Issues filed: [N]

Next steps:
  bd ready --label=test-gap   - See test issues to fix
  /impl [issue-id]            - Work on specific gap
```

## Anti-Patterns

- Stopping on test failures (capture and continue)
- Not checking for coverage tooling
- Filing every gap as critical (prioritize by file importance)
- Ignoring skipped tests (they accumulate)
- Not running all tiers (unit may pass, e2e may fail)
- Creating beads without user consent
