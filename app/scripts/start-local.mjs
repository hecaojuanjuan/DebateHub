import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "./sites-env.mjs";

const child = spawn(
  process.execPath,
  [
    "--import",
    pathToFileURL(path.join(projectRoot, "scripts/sites-env.mjs")).href,
    path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
    "dev",
    "--config",
    path.join(projectRoot, "dist/server/wrangler.json"),
    "--local",
    "--persist-to",
    path.join(projectRoot, ".wrangler/state"),
    "--ip",
    "127.0.0.1",
    "--inspector-port",
    "0",
    "--env-file",
    path.join(projectRoot, ".dev.vars"),
    ...process.argv.slice(2).filter((value) => value !== "--"),
  ],
  { cwd: projectRoot, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
