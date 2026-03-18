# Screen Navigation Flow
_Last updated: 2026-03-18 by initial setup_
_Covers: src/navigation/**, src/screens/**_

## Purpose
Manages navigation between screens using React Navigation.

## Entry points
- App launch → RootNavigator
- Deep link → linking config → appropriate screen

## Critical invariants
- Auth state determines initial route (login vs. home)
- Navigation state is not persisted to storage in production
- All screen params are typed via NavigatorParamList

## Execution path
1. App mounts RootNavigator
2. AuthContext checks stored token
3. If authenticated: render MainStack
4. If not: render AuthStack
5. User navigates via buttons/tabs → navigation.navigate()

## Known edge cases
- Deep link to protected screen: redirect to login, then forward
- Back handler on Android: custom behavior on certain screens

## What must NOT change without updating this flow
- The RootNavigator structure (Auth vs Main stack split)
- The deep linking configuration in linking.ts

## Dependencies
- Depends on: none
- Depended on by: all screen components
