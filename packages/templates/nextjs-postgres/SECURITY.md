# Security Checklist — Next.js + Postgres

## Input Validation
- [ ] All API inputs validated with Zod schemas
- [ ] No `dangerouslySetInnerHTML` unless content is sanitized with DOMPurify
- [ ] File uploads validated: type, size, content
- [ ] URL parameters validated and typed

## Database
- [ ] All queries use Prisma (no raw SQL string concatenation)
- [ ] No `$queryRaw` with user input (use `$queryRawUnsafe` never, `Prisma.sql` tagged template if raw needed)
- [ ] Database credentials from environment variables only

## Authentication
- [ ] Session tokens are HttpOnly, Secure, SameSite=Strict
- [ ] CSRF protection on all state-changing endpoints
- [ ] Password hashing with bcrypt (cost factor >= 12)
- [ ] Rate limiting on auth endpoints

## OWASP Top 10
- [ ] No SQL injection (Prisma handles this)
- [ ] No XSS (React escapes by default, no dangerouslySetInnerHTML)
- [ ] No CSRF (Next.js Server Actions include CSRF tokens)
- [ ] No sensitive data in client-side code or localStorage
- [ ] Dependencies checked for known vulnerabilities
- [ ] Error messages do not leak stack traces or internal details in production
