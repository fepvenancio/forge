# Architecture — Next.js + Postgres

## Directory Structure
```
app/
├── api/           # API Route Handlers (server-only)
├── (auth)/        # Auth-related routes (grouped)
├── (dashboard)/   # Dashboard routes (grouped)
└── layout.tsx     # Root layout

components/
├── ui/            # Generic UI primitives
└── features/      # Feature-specific components

lib/
├── db.ts          # Prisma client instance
├── auth.ts        # Auth utilities
└── validators/    # Zod schemas for input validation

prisma/
├── schema.prisma  # Database schema
└── migrations/    # Migration history
```

## Data Flow
1. Client → API Route Handler or Server Action
2. Handler validates input with Zod
3. Handler calls Prisma for database operations
4. Handler returns typed JSON response
5. Client receives and renders

## Key Invariants
- No direct database calls from Client Components
- All user input validated with Zod before database operations
- Prisma client is singleton (lib/db.ts)
- Migrations are sequential and never edited after deployment
