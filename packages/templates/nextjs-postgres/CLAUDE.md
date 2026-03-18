# Project Conventions — Next.js + Postgres

## Stack
- Next.js 14 App Router
- TypeScript (strict mode)
- Prisma ORM
- PostgreSQL
- Tailwind CSS

## Conventions
- Server Components by default — use `"use client"` only when needed
- No `any` type — use proper typing everywhere
- API routes in `/app/api/` using Route Handlers
- Database access only in Server Components or API routes — never in Client Components
- Use `async/await` throughout — no `.then()` chains
- File naming: kebab-case for routes, PascalCase for components
- Imports: absolute paths via `@/` alias

## Error handling
- API routes: return structured JSON errors with status codes
- Server Components: use error.tsx boundaries
- Client Components: use ErrorBoundary pattern

## Testing
- Unit tests: Vitest
- E2E tests: Playwright
- Test files: `*.test.ts` or `*.test.tsx` adjacent to source
