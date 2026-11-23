// Makes the app reach the live server on every network (see native/LiveServerDns.java):
//  - tries several of the server's addresses at once and uses one that answers
//  - limits how long one connection attempt may take (React Native's default is no limit)
const fs = require("fs");
const path = require("path");
const { withDangerousMod, withMainApplication } = require("expo/config-plugins");

// Vercel's public addresses for *.vercel.app (every one serves every project). Only used besides
// the ones DNS gives; if Vercel changes them they just stop helping. Check: nslookup vercel.app
const VERCEL_IPS = [3, 67, 131, 195].flatMap((n) => [`64.29.17.${n}`, `216.198.79.${n}`]);

const IMPORTS = `import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
`;

module.exports = function withReachableServer(config) {
  const host = new URL(config.extra.defaultApiUrl).hostname;
  const ips = host.endsWith(".vercel.app") ? VERCEL_IPS : [];

  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/java", ...cfg.android.package.split("."));
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(__dirname, "native/LiveServerDns.java"), path.join(dir, "LiveServerDns.java"));
      return cfg;
    },
  ]);

  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes("LiveServerDns")) return cfg;
    const setup = `    // Dayora: reach the live server on every network (plugins/withReachableServer.js)
    val liveServerDns = LiveServerDns("${host}", listOf(${ips.map((ip) => `"${ip}"`).join(", ")}))
    OkHttpClientProvider.setOkHttpClientFactory(object : OkHttpClientFactory {
      override fun createNewNetworkModuleClient(): OkHttpClient =
        OkHttpClientProvider.createClientBuilder()
          .dns(liveServerDns)
          .connectTimeout(8, TimeUnit.SECONDS)
          .pingInterval(15, TimeUnit.SECONDS)
          .build()
    })
`;
    src = src.replace(/(\nimport com\.facebook\.react\.ReactHost\r?\n)/, `$1${IMPORTS}`);
    src = src.replace(/(\n)(    loadReactNative\(this\))/, `$1${setup}$2`);
    if (!src.includes("LiveServerDns(") || !src.includes("import okhttp3.OkHttpClient"))
      throw new Error("Dayora: couldn't add LiveServerDns to MainApplication");
    cfg.modResults.contents = src;
    return cfg;
  });
};
