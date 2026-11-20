# Dayora Mobile (Expo / React Native)

Native Android app for Dayora: dashboard, tasks, money & budgets, habits, calendar &
reminders (with local notifications), notes, history/reports and settings. It talks to the
FastAPI backend with a Bearer token stored in the device's secure storage.

## Which API the app uses

By default the app talks to the hosted API at **https://dayora-api.vercel.app** (Vercel,
Neon Postgres). It's set by `expo.extra.defaultApiUrl` in `app.json`.

To test against a backend on your PC instead, run it on the network:

```bash
cd backend
.venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

then press and hold the logo on the sign-in screen and enter `http://<your-pc-ip>:8000`
(Android emulator: `http://10.0.2.2:8000`). Windows Firewall must allow inbound TCP 8000.
A saved local address is replaced by the hosted API automatically on the next launch of a
build whose default is `https://`.

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

## Sign-up email codes

Creating an account emails a 6-digit code (see `backend/README.md` → "Sending from Gmail").
Until SMTP is set up, the development API returns the code and the verify screen shows it
("tap to fill").

## Google sign-in setup

Uses `@react-native-google-signin/google-signin` (native, so rebuild the APK after changes).

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, then
   **APIs & Services → OAuth consent screen**: External, add your Gmail as a test user.
2. **Credentials → Create credentials → OAuth client ID → Android**:
   package `app.dayora.mobile`, SHA-1 of the signing key. For debug builds made here:
   `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
   (`keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android`).
3. **Create credentials → OAuth client ID → Web application** (no URLs needed). Copy its
   client ID into:
   - `app.json` → `expo.extra.googleWebClientId` (restart `npx expo start`; no APK rebuild needed)
   - `backend/.env` → `GOOGLE_CLIENT_IDS=` (restart the API)

"Google sign-in isn't set up for this app's signing key (SHA-1)" means step 2 doesn't match
the APK's package name or SHA-1. A release build signed with another key needs its own SHA-1.
