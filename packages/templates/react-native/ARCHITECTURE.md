# Architecture — React Native (Expo)

## Directory Structure
```
src/
├── screens/       # Screen components (one per route)
├── components/    # Shared UI components
│   ├── ui/        # Primitives (Button, Input, Card)
│   └── features/  # Feature components
├── navigation/    # React Navigation config
├── services/      # API client and service layer
├── stores/        # Zustand stores
├── hooks/         # Custom hooks
├── utils/         # Pure utility functions
└── types/         # Shared TypeScript types

assets/            # Images, fonts, etc.
```

## Data Flow
1. Screen → Hook or Store
2. Hook/Store → Service (API call)
3. Service → External API
4. Response → Store update → Screen re-render

## Key Invariants
- Screens are thin — business logic lives in hooks and stores
- API calls go through services, never direct fetch in components
- Navigation state is managed by React Navigation, not Zustand
