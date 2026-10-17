import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Run the built Worker directly, without Wrangler's reload/retry HTTP proxy.
// Never run this and the normal preview against the same SQLite state at once.
const require = createRequire(import.meta.url);
const { Miniflare } = require(
  require.resolve("miniflare", { paths: [require.resolve("wrangler")] }),
);
const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await readFile(path.join(root, "dist/server/wrangler.json"), "utf8"),
);
const bindings = parseEnv(await readFile(path.join(root, ".dev.vars"), "utf8"));
const moduleRoot = path.join(root, "dist/server");
const modulePaths = (await readdir(moduleRoot, { recursive: true })).filter(
  (p) => /\.m?js$/.test(p) && p !== "index.js",
);
const runtime = new Miniflare({
  host: "127.0.0.1",
  port: 5185,
  modules: ["index.js", ...modulePaths].map((p) => ({
    type: "ESModule",
    path: path.join(moduleRoot, p),
  })),
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags,
  bindings,
  d1Databases: { DB: config.d1_databases[0].database_id },
  d1Persist: path.join(root, ".wrangler/state/v3/d1"),
  durableObjects: {
    COMMUNITY_HUB: { className: "CommunityHub", useSQLite: true },
  },
  durableObjectsPersist: path.join(root, ".wrangler/state/v3/do-benchmark"),
});
console.log(`Benchmark Worker ready: ${await runtime.ready}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await runtime.dispose();
    process.exit(0);
  });
