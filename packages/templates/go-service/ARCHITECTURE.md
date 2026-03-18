# Architecture — Go Service

## Directory Structure
```
cmd/
└── server/
    └── main.go        # Entry point

internal/
├── handler/           # HTTP handlers
├── service/           # Business logic
├── repository/        # Database access (pgx)
├── middleware/         # HTTP middleware
├── model/             # Domain types
└── config/            # Configuration loading

pkg/                   # Shared packages (if any)

migrations/            # SQL migration files
```

## Data Flow
1. HTTP Request → Middleware chain → Handler
2. Handler validates input, calls Service
3. Service implements business logic, calls Repository
4. Repository executes SQL via pgx, returns model
5. Handler marshals response to JSON

## Key Invariants
- Handlers never call Repository directly — always through Service
- All database access is in Repository — no SQL in handlers or services
- Context is threaded through every layer
- Graceful shutdown with signal handling
