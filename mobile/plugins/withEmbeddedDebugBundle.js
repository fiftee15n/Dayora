// Debug-APK helpers for Dayora:
//  1. Optional: bundle the JS into debug APKs (EMBED_DEBUG_BUNDLE=1 when running prebuild), so a
//     debug build runs without Metro. By default the debug APK is a development build
//     (expo-dev-client) that loads the JS from `npx expo start`.
//  2. On Windows, native (CMake) build folders under android/app/.cxx exceed the 260-char path
//     limit. If CXX_STAGING_DIR is set (e.g. D:/c), CMake builds there instead.
//  3. Release builds are signed with the private key in mobile/credentials/.
//  4. Debug builds are a separate app ("Dayora Dev", app.dayora.mobile.dev), so debug and release
//     install side by side. With one shared ID, Android refuses to install one over the other
//     because they're signed with different keys.
const fs = require("fs");
const path = require("path");
const { withAppBuildGradle, withDangerousMod } = require("expo/config-plugins");

const STAGING = `
    // Dayora: short CMake build folder on Windows (set CXX_STAGING_DIR, e.g. D:/c)
    if (System.getenv("CXX_STAGING_DIR")) {
        externalNativeBuild {
            cmake {
                buildStagingDirectory = file(System.getenv("CXX_STAGING_DIR"))
                // Ninja 1.12+ (in CMake 3.31) supports long paths once Windows' LongPathsEnabled is on.
                if (System.getenv("DAYORA_CMAKE_VERSION")) {
                    version System.getenv("DAYORA_CMAKE_VERSION")
                }
            }
        }
        // Release builds use a longer folder (RelWithDebInfo); let CMake hash object paths
        // longer than 128 characters so they stay under Windows' 260-character limit.
        defaultConfig {
            externalNativeBuild {
                cmake {
                    arguments "-DCMAKE_OBJECT_PATH_MAX=128"
                }
            }
        }
    }
`;

const RELEASE_PROPS = `// Dayora: release signing key (mobile/credentials/keystore.properties, never committed)
def dayoraKeystoreProps = new Properties()
def dayoraKeystoreFile = rootProject.file("../credentials/keystore.properties")
if (dayoraKeystoreFile.exists()) {
    dayoraKeystoreFile.withInputStream { dayoraKeystoreProps.load(it) }
}`;

const RELEASE_SIGNING = `        if (dayoraKeystoreFile.exists()) {
            release {
                storeFile rootProject.file("../credentials/" + dayoraKeystoreProps["storeFile"])
                storePassword dayoraKeystoreProps["storePassword"]
                keyAlias dayoraKeystoreProps["keyAlias"]
                keyPassword dayoraKeystoreProps["keyPassword"]
            }
        }
`;

const DEBUG_STRINGS = `<resources>
  <string name="app_name">Dayora Dev</string>
</resources>
`;

module.exports = function withEmbeddedDebugBundle(config) {
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app/src/debug/res/values");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "strings.xml"), DEBUG_STRINGS);
      return cfg;
    },
  ]);
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    const marker = "debuggableVariants = []";
    if (process.env.EMBED_DEBUG_BUNDLE === "1" && !src.includes(marker)) {
      src = src.replace(/react \{\n/, `react {\n    ${marker} // Dayora: embed the JS bundle in debug builds\n`);
    }
    if (!src.includes("CXX_STAGING_DIR")) {
      src = src.replace(/\nandroid \{\n/, `\nandroid {\n${STAGING}`);
    }
    // 3. Release signing with the private key in mobile/credentials/ (git-ignored). Without that
    //    folder, release builds fall back to the debug key, as in the Expo template.
    if (!src.includes("dayoraKeystoreFile")) {
      // The release *build type* (inside buildTypes, after the debug one) switches key.
      src = src.replace(
        /(buildTypes \{[\s\S]*?\n\s*release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
        "$1signingConfig dayoraKeystoreFile.exists() ? signingConfigs.release : signingConfigs.debug",
      );
      src = src.replace(/\nandroid \{\n/, `\n${RELEASE_PROPS}\nandroid {\n`);
      src = src.replace(/signingConfigs \{\n/, `signingConfigs {\n${RELEASE_SIGNING}`);
    }
    if (!src.includes("applicationIdSuffix")) {
      src = src.replace(/(buildTypes \{\s*debug \{\r?\n)/, '$1            applicationIdSuffix ".dev"\n');
      if (!src.includes("applicationIdSuffix")) throw new Error("Dayora: couldn't set the debug app ID in build.gradle");
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
