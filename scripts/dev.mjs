import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = new Map();
let stopping = false;
let requestedExitCode = 0;

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  requestedExitCode = exitCode;
  for (const child of children.values()) if (child.exitCode === null) child.kill();
  if (children.size === 0) process.exit(exitCode);
}

for (const script of ["dev:api", "dev:mobile"]) {
  const child = spawn(npm, ["run", script], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  children.set(script, child);
  child.once("error", (error) => {
    console.error(`Could not start ${script}:`, error.message);
    stopAll(1);
  });
  child.once("exit", (code) => {
    children.delete(script);
    if (!stopping) stopAll(code ?? 1);
    if (stopping && children.size === 0) process.exit(requestedExitCode || code || 0);
  });
}

process.once("SIGINT", () => stopAll(130));
process.once("SIGTERM", () => stopAll(143));
