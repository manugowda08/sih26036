# LM Smart field app (Phase 7)

Flutter client for Legal Metrology officers. It talks only to the existing Fastify API (`http://127.0.0.1:4000`).

```powershell
cd apps/mobile
flutter pub get
flutter run -d windows
# Android emulator:
# flutter run -d emulator --dart-define=API_BASE_URL=http://10.0.2.2:4000
```

Demo LMO: `lmo@lmsmart.demo` / `Demo@12345`

The JWT is stored in `%APPDATA%\lm_smart\session.json` on desktop/Android-style IO, and in browser `localStorage` on Flutter web. The JWT is stored in `%APPDATA%\lm_smart\session.json` on desktop/Android-style IO, and in browser `localStorage` on Flutter web. The Fastify API must already be running.
