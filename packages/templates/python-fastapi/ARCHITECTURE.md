# Architecture — Python FastAPI

## Directory Structure
```
app/
├── routers/       # FastAPI routers (API endpoints)
├── services/      # Business logic layer
├── models/        # SQLAlchemy models
├── schemas/       # Pydantic request/response schemas
├── dependencies/  # Dependency injection providers
├── core/
│   ├── config.py  # Settings via pydantic-settings
│   ├── database.py # SQLAlchemy engine + session
│   └── security.py # Auth utilities
└── main.py        # FastAPI app entry point

tests/
├── conftest.py    # Fixtures
├── test_routers/  # Router tests
└── test_services/ # Service tests
```

## Data Flow
1. Request → Router (validates via Pydantic schema)
2. Router → Service (business logic)
3. Service → Model (database via SQLAlchemy)
4. Model → Service → Router → Response (Pydantic schema)

## Key Invariants
- No business logic in routers — routers only validate and delegate
- All database sessions managed via dependency injection
- Pydantic schemas are the API contract — models are internal
