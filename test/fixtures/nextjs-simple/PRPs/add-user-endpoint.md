# PRP: Add User Endpoint

## Description
Add a POST `/api/users` endpoint that:
1. Accepts JSON body with `name` (string) and `email` (string)
2. Validates input with Zod
3. Returns 201 with the created user object
4. Returns 400 for invalid input

## Acceptance Criteria
- POST /api/users returns 201 for valid input
- POST /api/users returns 400 for invalid input
- Input is validated with Zod schema
- Response includes id, name, email fields
