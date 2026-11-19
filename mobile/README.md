# Dayora Mobile (Expo / React Native)

Native Android app for Dayora: dashboard, tasks, money & budgets, habits, calendar &
reminders (with local notifications), notes, history/reports and settings. It talks to the
FastAPI backend with a Bearer token stored in the device's secure storage.

## Run the API so the phone can reach it

```bash
cd backend
.venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The phone must be on the same Wi-Fi as the PC, and Windows Firewall must allow inbound
TCP 8000 (allow Python when Windows asks, or add a rule for port 8000).

The app's server URL can be changed on the sign-in screen ("Server: …") or in
Settings → Server. The default comes from `expo.extra.defaultApiUrl` in `app.json`.
On the Android emulator use `http://10.0.2.2:8000`.

## Debug APK = development build (loads the app from `npx expo start`)

The debug APK includes `expo-dev-client`. It doesn't contain the app's JavaScript; it opens
the Expo dev launcher, and you connect it to the Metro server running on your PC.

Build it (Windows: `CXX_STAGING_DIR` keeps native build paths under the 260-char limit):

```bash
npx expo prebuild -p android --clean
cd android
CXX_STAGING_DIR=D:/c ./gradlew.bat assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Install with `adb install -r app-debug.apk`, or copy the file to the phone and open it
(allow "Install unknown apps"). You only rebuild it when native packages change.

Use it:

```bash
npx expo start --dev-client -c
```

Metro prints an address like `http://192.168.1.18:8081`. Open Dayora on the phone; the dev
launcher lists servers it finds on the network. Tap yours, or choose "Enter URL manually" and
type that address. JS changes then reload live.

## Standalone debug APK (runs without Metro)

Set `EMBED_DEBUG_BUNDLE=1` when running prebuild and the JS bundle is embedded instead:

```bash
EMBED_DEBUG_BUNDLE=1 npx expo prebuild -p android --clean
cd android
CXX_STAGING_DIR=D:/c ./gradlew.bat assembleDebug
```
