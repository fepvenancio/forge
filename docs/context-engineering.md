# Context Engineering

How to write context files for a Forge-managed project.

## Overview

Forge agents read five types of context files from your project. These files are the **only way** to communicate your project's conventions, architecture, and quality standards to the agents.

## CLAUDE.md

Your project's coding conventions. This is the most frequently read file — every Worker starts here.

**What to include:**
- Stack and framework versions
- Naming conventions (file naming, variable naming)
- Import conventions (absolute vs relative, aliases)
- Error handling patterns
- Testing patterns
- Anything you'd tell a new team member on day one

**What NOT to include:**
- Architecture decisions (put in ARCHITECTURE.md)
- Security rules (put in SECURITY.md)
- Quality thresholds (put in QUALITY.md)

## ARCHITECTURE.md

Your project's structural invariants. The High Court reads this to verify Workers didn't break the architecture.

**What to include:**
- Directory structure and what goes where
- Data flow (how requests move through layers)
- Key invariants (rules that must always hold)
- Database access patterns
- API design patterns

**What NOT to include:**
- Implementation details that change frequently
- Individual function documentation

## SECURITY.md

A checklist of security rules. Workers self-audit against this inline before committing.

**Format:** Use checkboxes for each rule. Workers check them off as they verify.

**What to include:**
- Input validation rules
- Database query safety rules
- Authentication/authorization rules
- OWASP Top 10 relevant items for your stack
- Secrets management rules

## QUALITY.md

Quality standards and testing requirements.

**Required fields:**
- `property_based`: `required` | `optional` | `disabled`
- `runner`: The property testing framework (fast-check, Hypothesis, etc.)
- Coverage threshold
- Build command

The Sub-Judge reads this to determine what to check and how strictly.

## Flow Documents

Flow documents describe execution paths through your codebase. They live in `.flows/` and are registered in `flow-registry.json`.

**When to write a Flow:**
- Any path that touches multiple files
- Any path with atomicity requirements
- Any path a new developer would need to understand

**Template:**
```
# [Flow Name]
_Last updated: YYYY-MM-DD by task-[ID]_
_Covers: [file patterns]_

## Purpose
## Entry points
## Critical invariants
## Execution path
## Known edge cases
## What must NOT change without updating this flow
## Dependencies
```

## flow-registry.json

Maps flows to source file patterns:

```json
{
  "flows": [
    {
      "id": "flow-auth",
      "path": ".flows/authentication.md",
      "title": "Authentication Flow",
      "criticality": "critical",
      "file_patterns": ["src/auth/**", "src/middleware/auth.ts"]
    }
  ]
}
```

**Criticality levels:**
- `critical`: Core business logic, security, data integrity
- `high`: Important paths, frequently modified
- `medium`: Standard features
- `low`: Utilities, helpers, rarely modified

The Librarian uses criticality to prioritize Flow updates. The flow-freshness CI gate blocks PRs that touch files covered by stale flows.
