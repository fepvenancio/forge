# Project Conventions — Go Service

## Stack
- Go 1.22+
- Standard library HTTP server (net/http)
- PostgreSQL with pgx driver
- No heavy frameworks — stdlib first

## Conventions
- Interfaces over concrete types for dependency injection
- Errors as values — wrap with fmt.Errorf("context: %w", err)
- Context propagation: first parameter of every function
- File naming: snake_case.go
- Package names: short, lowercase, no underscores

## Error handling
- Return errors, don't panic
- Wrap errors with context at each layer
- HTTP handlers: write structured JSON error responses
- Use errors.Is() and errors.As() for error matching

## Testing
- Unit: go test
- Table-driven tests preferred
- Test files: *_test.go in same package
