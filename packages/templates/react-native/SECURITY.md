# Security Checklist — React Native

## Data Storage
- [ ] No sensitive data in AsyncStorage (use Expo SecureStore)
- [ ] API tokens stored in SecureStore, not in state
- [ ] No sensitive data in Redux/Zustand persisted state

## Network
- [ ] All API calls use HTTPS
- [ ] Certificate pinning enabled for production builds
- [ ] API responses validated before use

## Authentication
- [ ] Biometric auth for sensitive operations
- [ ] Session timeout enforced
- [ ] Logout clears all stored tokens and cached data

## General
- [ ] No sensitive data in console.log (strip in production)
- [ ] Deep links validated before processing
- [ ] No inline eval() or Function() constructor
