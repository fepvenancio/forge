# User Authentication Flow
_Last updated: 2026-03-18 by initial setup_
_Covers: app/api/auth/**, lib/auth.ts, app/(auth)/**_

## Purpose
Handles user registration, login, session management, and logout.

## Entry points
- POST /api/auth/register → registerHandler()
- POST /api/auth/login → loginHandler()
- POST /api/auth/logout → logoutHandler()
- GET /api/auth/session → getSessionHandler()

## Critical invariants
- Passwords are never stored in plaintext — bcrypt hash only
- Session tokens are HttpOnly cookies, never accessible via JavaScript
- Failed login attempts are rate-limited (5 per minute per IP)
- Logout invalidates the session server-side, not just client-side

## Execution path
1. User submits credentials via form
2. API route validates input with Zod
3. For login: bcrypt.compare against stored hash
4. On success: create session in database, set HttpOnly cookie
5. On failure: increment rate limit counter, return generic error

## Known edge cases
- Concurrent sessions: allowed, each gets its own token
- Token expiry: 24 hours, refresh on activity

## What must NOT change without updating this flow
- The bcrypt cost factor (currently 12)
- The session cookie configuration (HttpOnly, Secure, SameSite)
- The rate limiting threshold

## Dependencies
- Depends on: none
- Depended on by: all authenticated routes
