# Security Checklist — Go Service

## Input Validation
- [ ] All handler inputs validated and typed
- [ ] No fmt.Sprintf in SQL queries
- [ ] Request body size limited (http.MaxBytesReader)

## Database
- [ ] All queries use pgx parameterized queries ($1, $2)
- [ ] No string concatenation in SQL
- [ ] Connection pool configured with limits
- [ ] Credentials from environment variables only

## Authentication
- [ ] JWT validation with proper clock skew tolerance
- [ ] Secrets loaded from env, never in source
- [ ] Rate limiting middleware on auth endpoints

## General
- [ ] No sensitive data logged
- [ ] TLS in production (or behind TLS-terminating proxy)
- [ ] Graceful shutdown drains connections
- [ ] Dependency versions pinned in go.sum
