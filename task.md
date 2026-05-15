# ytclone task tracker

## DONE
- [x] CLight palette in tokens.ts
- [x] useColors() hook in hooks/useColors.ts
- [x] _layout.tsx (tabs) — already themed
- [x] index.tsx — already themed, added Google auth integration
- [x] search.tsx — already themed
- [x] library.tsx — already themed + Google liked/watch-later sections
- [x] shorts.tsx (channels) — already themed
- [x] player/[id].tsx — already themed

## Google Auth / YT Feed
- [x] Backend: packages/web/src/api/routes/google-auth.ts
  - POST /api/auth/google/token (exchange code)
  - POST /api/auth/google/revoke
  - GET /api/feed/subscriptions (channels list)
  - GET /api/feed/subscriptions/videos (latest from subs)
  - GET /api/feed/home (personalized)
  - GET /api/feed/liked (liked videos "LL" playlist)
  - GET /api/feed/watch-later (WL playlist)
- [x] Backend: registered in index.ts
- [x] Mobile: context/GoogleAuthContext.tsx (PKCE OAuth flow)
- [x] Mobile: _layout.tsx wraps with GoogleAuthProvider
- [x] Mobile: index.tsx — Google sign-in in profile sheet, "My Feed" chip when signed in
- [x] Mobile: library.tsx — History/Liked/Watch Later tabs

## WAITING FOR
- [ ] User to provide GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET via secrets form
- [ ] After secrets: restart API server to pick up env vars

## POST-SETUP NEEDED (user side)
1. Google Cloud Console → Enable YouTube Data API v3
2. OAuth Consent Screen: add scopes youtube.readonly
3. Authorized redirect URIs: ytclone://redirect (for Android)
4. For Expo Go testing: use proxy redirect URI

## KNOWN ISSUES
- expo-auth-session makeRedirectUri with scheme works for standalone builds
- For Expo Go: may need AuthSession.makeRedirectUri({ useProxy: true })
