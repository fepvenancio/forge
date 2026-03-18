# Quality Standards

## Test framework
- Unit: go test
- Coverage threshold: 80% on new code

## Property-based testing
property_based: optional
runner: go built-in fuzzing (go test -fuzz)
apply_when: parsers, serializers, protocol handlers

## Linter
golangci-lint with default config.

## Build
`go build ./...` must exit 0.
