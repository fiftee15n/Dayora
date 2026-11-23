#!/usr/bin/env bash
# Build a Dayora APK and check it talks to the right server. Run in Git Bash:
#   scripts/build-apk.sh debug     -> "Dayora Dev": uses the backend on this PC (same Wi-Fi)
#   scripts/build-apk.sh release   -> "Dayora": uses the live server, works on any network
# An APK is only copied to D:/Dayora-builds after every check passes.
set -euo pipefail

KIND="${1:-}"
[[ "$KIND" == debug || "$KIND" == release ]] || { echo "Usage: $0 debug|release"; exit 2; }
cd "$(dirname "$0")/.."
OUT="${DAYORA_BUILDS:-D:/Dayora-builds}"
SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
BT="$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)"
RELEASE_CERT="b32272836d38ea6922a50f528e9f6cc3b3961cdc61dc2dca0c8928230655b3b5"

fail() { echo "FAILED: $*" >&2; exit 1; }
ok() { echo "  ok: $*"; }
conf() { node -p "require('./app.json').expo.$1"; }

VERSION="$(conf version)"
LIVE="$(conf extra.defaultApiUrl)"
DEV="$(conf extra.devApiUrl)"

echo "Checking addresses before building"
if [[ "$KIND" == release ]]; then
  [[ "$LIVE" == https://* ]] || fail "defaultApiUrl must be a public https:// address, got $LIVE"
  curl -fsS -m 40 "$LIVE/api/health" >/dev/null || fail "live server $LIVE is not answering"
  ok "live server $LIVE answers"
else
  IP="$(sed -E 's#^https?://([^:/]+).*#\1#' <<<"$DEV")"
  ipconfig | grep -F "IPv4" | tr -d '\r' | grep -qE ": ${IP//./\\.}$" \
    || fail "devApiUrl is $DEV but this PC no longer has the address $IP. Update extra.devApiUrl in app.json."
  ok "this PC has the address $IP"
fi

npx expo prebuild -p android --no-install
TASK=assembleDebug; [[ "$KIND" == release ]] && TASK=assembleRelease
(cd android && CXX_STAGING_DIR="${CXX_STAGING_DIR:-D:/c}" DAYORA_CMAKE_VERSION="${DAYORA_CMAKE_VERSION:-3.31.6}" ./gradlew.bat "$TASK" -q)
APK="android/app/build/outputs/apk/$KIND/app-$KIND.apk"

echo "Checking $APK"
BADGING="$("$BT/aapt.exe" dump badging "$APK")"
MANIFEST="$("$BT/aapt.exe" dump xmltree "$APK" AndroidManifest.xml)"
CONFIG="$(unzip -p "$APK" assets/app.config)"
CERT="$(java -jar "$BT/lib/apksigner.jar" verify --print-certs "$APK" | sed -nE 's/.*certificate SHA-256 digest: //p' | head -1 | tr -d '\r')"

if [[ "$KIND" == release ]]; then
  grep -q "package: name='app.dayora.mobile' " <<<"$BADGING" || fail "wrong app ID"
  ok "app ID app.dayora.mobile"
  ! grep -q "application-debuggable" <<<"$BADGING" || fail "APK is debuggable"
  ! grep -qi "devlauncher" <<<"$MANIFEST" || fail "APK contains the Expo dev launcher"
  ok "not a development build"
  [[ "$CERT" == "$RELEASE_CERT" ]] || fail "not signed with the Dayora release key"
  ok "signed with the release key"
  ! grep -qE "usesCleartextTraffic.*0xffffffff" <<<"$MANIFEST" || fail "plain http:// is allowed"
  ok "plain http:// (a PC on Wi-Fi) is blocked"
  grep -qF "\"defaultApiUrl\":\"$LIVE\"" <<<"$CONFIG" || fail "live server missing from the APK"
  BUNDLE="$(mktemp)"; trap 'rm -f "$BUNDLE"' EXIT
  unzip -p "$APK" assets/index.android.bundle > "$BUNDLE"
  [[ -s "$BUNDLE" ]] || fail "JavaScript isn't inside the APK"
  ! grep -aqF "devApiUrl" "$BUNDLE" || fail "code still refers to the PC address"
  ok "uses $LIVE and runs without the PC"
  grep -q "LiveServerDns(" android/app/src/main/java/app/dayora/mobile/MainApplication.kt || fail "mobile-network fix is missing"
  ok "mobile-network fix (LiveServerDns) included"
  DEST="$OUT/dayora-$VERSION-release.apk"
else
  grep -q "package: name='app.dayora.mobile.dev' " <<<"$BADGING" || fail "wrong app ID"
  ok "app ID app.dayora.mobile.dev (installs next to the release app)"
  grep -q "application-label:'Dayora Dev'" <<<"$BADGING" || fail "app should be named Dayora Dev"
  grep -q "application-debuggable" <<<"$BADGING" || fail "APK isn't debuggable"
  grep -qE "usesCleartextTraffic.*0xffffffff" <<<"$MANIFEST" || fail "plain http:// to the PC is blocked"
  grep -qF "\"devApiUrl\":\"$DEV\"" <<<"$CONFIG" || fail "PC address missing from the APK"
  ok "named Dayora Dev, uses $DEV"
  DEST="$OUT/dayora-debug.apk"
fi

mkdir -p "$OUT"
cp "$APK" "$DEST"
echo "READY: $DEST ($(stat -c %s "$DEST") bytes)"
