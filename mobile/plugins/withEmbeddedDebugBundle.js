// Debug-APK helpers for Dayora:
//  1. Optional: bundle the JS into debug APKs (EMBED_DEBUG_BUNDLE=1 when running prebuild), so a
//     debug build runs without Metro. By default the debug APK is a development build
//     (expo-dev-client) that loads the JS from `npx expo start`.
//  2. On Windows, native (CMake) build folders under android/app/.cxx exceed the 260-char path
//     limit. If CXX_STAGING_DIR is set (e.g. D:/c), CMake builds there instead.
const { withAppBuildGradle } = require("expo/config-plugins");

const STAGING = `
    // Dayora: short CMake build folder on Windows (set CXX_STAGING_DIR, e.g. D:/c)
    if (System.getenv("CXX_STAGING_DIR")) {
        externalNativeBuild {
            cmake {
                buildStagingDirectory = file(System.getenv("CXX_STAGING_DIR"))
            }
        }
    }
`;

module.exports = function withEmbeddedDebugBundle(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    const marker = "debuggableVariants = []";
    if (process.env.EMBED_DEBUG_BUNDLE === "1" && !src.includes(marker)) {
      src = src.replace(/react \{\n/, `react {\n    ${marker} // Dayora: embed the JS bundle in debug builds\n`);
    }
    if (!src.includes("CXX_STAGING_DIR")) {
      src = src.replace(/\nandroid \{\n/, `\nandroid {\n${STAGING}`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
