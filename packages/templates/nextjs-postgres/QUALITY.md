# Quality Standards

## Test framework
- Unit: Vitest
- E2E: Playwright
- Coverage threshold: 85% on new code

## Property-based testing
property_based: optional
runner: fast-check
apply_when: pure functions, data transformations, API input validation

## Linter
ESLint + Prettier. Config in .eslintrc and .prettierrc.

## Build
`npm run build` must exit 0.
