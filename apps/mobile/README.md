# LM Smart field app (Phase 7)

Flutter client for Legal Metrology officers. It talks to the existing Fastify API.

```powershell
cd apps/mobile
flutter pub get
```

Demo LMO: `lmo@lmsmart.demo` / `Demo@12345`

## API base URL (physical Android phone)

Do **not** use `http://127.0.0.1:4000` or `localhost` on a phone. That address is the phone, not your laptop.

1. Start the Fastify API so it listens on all interfaces (`host: 0.0.0.0`, port `4000`).
2. Put the laptop and phone on the same Wi-Fi (or hotspot).
3. Find the laptop LAN IPv4, for example:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } | Select-Object IPAddress, InterfaceAlias
```

Use the **Wi-Fi** address, not VMware/WSL adapters.

4. Run the app, substituting the laptop IP:

```powershell
cd apps/mobile
flutter devices
flutter run -d <ANDROID_DEVICE_ID> --dart-define=API_BASE_URL=http://<LAPTOP_LAN_IP>:4000
```

You can also type the same URL in the sign-in **API base URL** field. Android emulator (not a physical phone): `http://10.0.2.2:4000`.

The JWT is stored in `%APPDATA%\lm_smart\session.json` on desktop/Android-style IO, and in browser `localStorage` on Flutter web. The Fastify API must already be running.
