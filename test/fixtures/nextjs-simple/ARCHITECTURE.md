# Architecture — Test Fixture

## Directory Structure
```
app/
├── api/
│   └── users/
│       └── route.ts
├── page.tsx
└── layout.tsx
```

## Key Invariants
- API routes validate input with Zod
- No direct database calls from components
