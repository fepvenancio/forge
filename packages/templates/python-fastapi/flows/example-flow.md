# Request Authentication Flow
_Last updated: 2026-03-18 by initial setup_
_Covers: app/routers/auth.py, app/core/security.py, app/dependencies/auth.py_

## Purpose
Authenticates incoming API requests using JWT bearer tokens.

## Entry points
- POST /api/auth/token → create_token()
- Dependency: get_current_user() → injected into protected routes

## Critical invariants
- JWT secret is loaded from environment, never hardcoded
- Token expiry is enforced server-side
- Revoked tokens are checked against a blacklist table

## Execution path
1. Client sends credentials to POST /api/auth/token
2. Router validates via Pydantic LoginSchema
3. Service verifies password hash via passlib
4. On success: generate JWT with user_id claim, return token
5. Protected routes: FastAPI Depends(get_current_user) decodes JWT

## Known edge cases
- Expired token: returns 401, client must re-authenticate
- Malformed token: returns 401 with "Invalid token" message

## What must NOT change without updating this flow
- The JWT signing algorithm (RS256)
- The token claim structure (sub, exp, iat)

## Dependencies
- Depends on: none
- Depended on by: all protected routes
