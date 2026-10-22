# Appearance switch verification

- Avatar menu now offers Ocean glass and Native simple independently of light/dark mode.
- Existing color mode key retained; appearance uses research.appearance and defaults to Ocean.
- Four actual browser combinations verified; see combinations.json.
- Native: zero ocean Canvas elements. Ocean: one Canvas after reactivation.
- Reload retained native appearance and light mode. Profile form colors correctly resolve in both skins.
- Production build and 14 targeted tests passed; existing large-chunk warning remains.
- Only frontend presentation/preferences changed; profile handlers, APIs and backend unchanged.
