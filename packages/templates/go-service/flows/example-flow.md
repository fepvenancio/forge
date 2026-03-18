# HTTP Request Handling Flow
_Last updated: 2026-03-18 by initial setup_
_Covers: internal/handler/**, internal/middleware/**_

## Purpose
Handles incoming HTTP requests through the middleware chain to handlers.

## Entry points
- HTTP request → net/http.Server → router → middleware → handler

## Critical invariants
- All requests pass through logging and recovery middleware
- Auth middleware runs before all protected handlers
- Request context includes request ID for tracing
- Graceful shutdown waits for in-flight requests (30s timeout)

## Execution path
1. net/http.Server accepts connection
2. Router matches path to handler
3. Middleware chain: logging → recovery → auth → handler
4. Handler validates input
5. Handler calls service layer
6. Handler writes JSON response with status code

## Known edge cases
- Request timeout: context cancelled, handler returns 504
- Panic in handler: recovery middleware catches, returns 500

## What must NOT change without updating this flow
- The middleware ordering (logging → recovery → auth)
- The graceful shutdown timeout (30s)
- The request ID header name (X-Request-ID)

## Dependencies
- Depends on: none
- Depended on by: all HTTP handlers
