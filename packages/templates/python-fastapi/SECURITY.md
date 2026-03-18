# Security Checklist — Python FastAPI

## Input Validation
- [ ] All inputs validated via Pydantic models
- [ ] Path/query parameters typed and constrained
- [ ] File uploads validated: type, size, content

## Database
- [ ] All queries use SQLAlchemy ORM or parameterized Core queries
- [ ] No f-string SQL (`f"SELECT ... WHERE id = {user_id}"` is forbidden)
- [ ] Database credentials from environment variables via pydantic-settings

## Authentication
- [ ] JWT tokens with proper expiry (access: 15min, refresh: 7 days)
- [ ] Passwords hashed with passlib bcrypt
- [ ] Rate limiting on auth endpoints (slowapi or custom)
- [ ] CORS configured — no wildcard in production

## OWASP Top 10
- [ ] No SQL injection (SQLAlchemy parameterizes)
- [ ] No command injection (no os.system/subprocess with user input)
- [ ] Secrets from env only, never in code
- [ ] Error responses use HTTPException, never raw exception messages
