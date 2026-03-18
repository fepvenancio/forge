# Project Conventions — Python FastAPI

## Stack
- FastAPI
- Python 3.12+
- SQLAlchemy 2.0 (async)
- PostgreSQL
- Pydantic v2

## Conventions
- Async everywhere — use `async def` for all route handlers
- Pydantic models for ALL request/response bodies — no raw dicts
- Type hints on all functions
- SQLAlchemy 2.0 style (select() not query())
- File naming: snake_case throughout
- Imports: absolute from project root

## Error handling
- Use FastAPI HTTPException with structured detail
- Custom exception handlers for domain errors
- Never expose stack traces in production responses

## Testing
- Unit: pytest with pytest-asyncio
- Integration: pytest + httpx AsyncClient
- Test files: `test_*.py` in tests/ directory
