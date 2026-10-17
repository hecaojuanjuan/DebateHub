import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { projectRoot } from "./sites-env.mjs";

const { values } = parseArgs({
  options: {
    "database-id": { type: "string" },
    "database-name": { type: "string" },
    "account-id": { type: "string" },
    name: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
const deploymentRoot = path.join(projectRoot, ".sites-runtime/cloudflare");
const configPath = path.join(deploymentRoot, "wrangler.json");
const placeholderId = "00000000-0000-4000-8000-000000000000";
let previous = {};
try {
  previous = JSON.parse(await readFile(configPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const savedDatabase = previous.d1_databases?.find((db) => db.binding === "DB");
const databaseId =
  values["database-id"] ||
  savedDatabase?.database_id ||
  (values["dry-run"] ? placeholderId : "");
if (
  !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(databaseId) ||
  (!values["dry-run"] && databaseId === placeholderId)
) {
  throw new Error(
    "Create a Cloudflare D1 database, then pass its real UUID with --database-id.",
  );
}
const workerName = values.name || previous.name || "debatehub-unnc";
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(workerName)) {
  throw new Error(
    "Use a Worker name containing lowercase letters and hyphens.",
  );
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Deployment step failed with exit code ${result.status}.`);
  }
}
const wranglerArgs = [
  "--import",
  pathToFileURL(path.join(projectRoot, "scripts/sites-env.mjs")).href,
  path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
];
const secretPath = path.join(projectRoot, ".dev.vars");
if (!values["dry-run"]) {
  const secrets = parseEnv(await readFile(secretPath, "utf8"));
  if (!secrets.ADMIN_KEY || secrets.ADMIN_KEY.length < 24) {
    throw new Error(
      "Set a random ADMIN_KEY of at least 24 characters in .dev.vars.",
    );
  }
  if (Object.keys(secrets).some((key) => key !== "ADMIN_KEY")) {
    throw new Error(
      "Only ADMIN_KEY may be present in the deployment secrets file.",
    );
  }
}

runNode([path.join(projectRoot, "scripts/run-framework.mjs"), "build"]);
const buildRoot = path.join(projectRoot, "dist/server");
const built = JSON.parse(
  await readFile(path.join(buildRoot, "wrangler.json"), "utf8"),
);
const hosting = JSON.parse(
  await readFile(path.join(projectRoot, ".openai/hosting.json"), "utf8"),
);
if (hosting.d1 !== "DB" || hosting.r2) {
  throw new Error("This deployment script expects the DB binding without R2.");
}
const accountId = values["account-id"] || previous.account_id;
const config = {
  name: workerName,
  ...(accountId ? { account_id: accountId } : {}),
  main: path.resolve(buildRoot, built.main),
  compatibility_date: built.compatibility_date,
  compatibility_flags: built.compatibility_flags,
  no_bundle: built.no_bundle,
  rules: built.rules,
  durable_objects: built.durable_objects,
  migrations: built.migrations,
  assets: {
    ...built.assets,
    directory: path.resolve(buildRoot, built.assets.directory),
  },
  d1_databases: [
    {
      binding: "DB",
      database_name:
        values["database-name"] ||
        savedDatabase?.database_name ||
        "debatehub-unnc",
      database_id: databaseId,
      migrations_dir: path.join(projectRoot, "drizzle"),
    },
  ],
  workers_dev: true,
  preview_urls: false,
  observability: { enabled: false },
};
await mkdir(deploymentRoot, { recursive: true });
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

if (values["dry-run"]) {
  runNode([
    ...wranglerArgs,
    "deploy",
    "--config",
    configPath,
    "--dry-run",
    "--outdir",
    path.join(deploymentRoot, "dry-run"),
  ]);
  console.log("Dry run complete. No cloud resources or secrets were changed.");
} else {
  runNode([
    ...wranglerArgs,
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    configPath,
  ]);
  runNode([
    ...wranglerArgs,
    "deploy",
    "--config",
    configPath,
    "--secrets-file",
    secretPath,
  ]);
}
