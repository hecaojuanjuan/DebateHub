import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { projectRoot } from "./sites-env.mjs";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    "prepare-only": { type: "boolean", default: false },
  },
});
const backend = JSON.parse(
  await readFile(
    path.join(projectRoot, ".sites-runtime/cloudflare/wrangler.json"),
    "utf8",
  ),
);
const pagesName = values.name || backend.name;
if (!backend.account_id || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(pagesName)) {
  throw new Error(
    "Deploy the backend first and use a valid Pages project name.",
  );
}
const pagesRoot = path.join(projectRoot, ".sites-runtime/pages");
await mkdir(pagesRoot, { recursive: true });
const output = await mkdtemp(path.join(pagesRoot, "public-"));
const clientDirectory = path.resolve(path.dirname(backend.main), "../client");
await cp(clientDirectory, output, { recursive: true });
const assets = await readdir(clientDirectory, { withFileTypes: true });
await writeFile(
  path.join(output, "_routes.json"),
  JSON.stringify({
    version: 1,
    include: ["/*"],
    exclude: assets.map((entry) =>
      entry.isDirectory() ? `/${entry.name}/*` : `/${entry.name}`,
    ),
  }),
);
await writeFile(
  path.join(output, "_worker.js"),
  // Preserve the original URL, Origin header, body, and session cookies.
  // Static assets bypass this gateway through the generated routes file.
  "export default { fetch(request, env) { return env.APP.fetch(request); } };\n",
);
const configPath = path.join(pagesRoot, "wrangler.json");
await writeFile(
  configPath,
  `${JSON.stringify(
    {
      name: pagesName,
      pages_build_output_dir: output,
      compatibility_date: backend.compatibility_date,
      services: [{ binding: "APP", service: backend.name }],
    },
    null,
    2,
  )}\n`,
);
// Keep Pages from inheriting the backend Vite deployment redirect.
const redirectDirectory = path.join(pagesRoot, ".wrangler/deploy");
await mkdir(redirectDirectory, { recursive: true });
await writeFile(
  path.join(redirectDirectory, "config.json"),
  JSON.stringify({ configPath: "../../wrangler.json" }),
);
console.log(`Pages entry prepared for ${pagesName}; backend: ${backend.name}.`);
if (!values["prepare-only"]) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
      "pages",
      "deploy",
      output,
      "--project-name",
      pagesName,
      "--branch",
      "main",
      "--commit-dirty=true",
    ],
    {
      cwd: pagesRoot,
      stdio: "inherit",
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: backend.account_id },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
