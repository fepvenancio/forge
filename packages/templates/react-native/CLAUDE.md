# Project Conventions — React Native (Expo)

## Stack
- React Native with Expo SDK
- TypeScript (strict)
- React Navigation v6
- Zustand for state management
- Expo SecureStore for secrets

## Conventions
- Functional components only — no class components
- Hooks for all state and effects
- File naming: PascalCase for components, camelCase for utilities
- Screens in /screens/, components in /components/
- API calls only in /services/ — never in components directly

## Error handling
- Use Error Boundaries for component tree crashes
- API errors: typed error responses, user-friendly messages
- Offline: detect network state, queue actions

## Testing
- Unit: Jest + React Native Testing Library
- Test files: `*.test.tsx` adjacent to source
