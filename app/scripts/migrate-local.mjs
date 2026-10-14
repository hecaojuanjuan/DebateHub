import { writeFile, mkdir, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "./sites-env.mjs";

const configPath = path.join(projectRoot, ".sites-runtime", "d1.json");
await mkdir(path.dirname(configPath), { recursive: true });
await writeFile(
  configPath,
  JSON.stringify({
    name: "debatehub-local",
    compatibility_date: "2026-05-15",
    d1_databases: [
      {
        binding: "DB",
        database_name: "site-creator-d1",
        database_id: "00000000-0000-4000-8000-000000000000",
        migrations_dir: path.join(projectRoot, "drizzle"),
      },
    ],
  }),
);
const varsPath = path.join(projectRoot, ".dev.vars");
try {
  await access(varsPath);
} catch {
  await writeFile(varsPath, `ADMIN_KEY=${randomBytes(24).toString("hex")}\n`, {
    mode: 0o600,
  });
  console.log(
    "An initial owner key was saved to the ignored app/.dev.vars file.",
  );
}
const result = spawnSync(
  process.execPath,
  [
    "--import",
    pathToFileURL(path.join(projectRoot, "scripts/sites-env.mjs")).href,
    path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    configPath,
    "--persist-to",
    path.join(projectRoot, ".wrangler/state"),
  ],
  { cwd: projectRoot, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
