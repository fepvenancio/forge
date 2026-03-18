# Quality Standards

## Test framework
- Unit: pytest
- Integration: pytest + httpx
- Coverage threshold: 85% on new code

## Property-based testing
property_based: optional
runner: Hypothesis
apply_when: data models, parsing, business logic with numeric invariants

## Linter
ruff + mypy strict mode.

## Build
`python -m py_compile` on all changed files. Type check must pass.
