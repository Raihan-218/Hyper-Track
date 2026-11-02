import { rm, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const generatedPaths = [
  ".expo",
  "apps/mobile/.expo",
  "apps/mobile/dist",
  "apps/mobile/android/app/build",
  "apps/mobile/android/build",
  "apps/api/dist"
];

for (const relative of generatedPaths) {
  const target = path.resolve(repoRoot, relative);
  if (!target.startsWith(`${repoRoot}${path.sep}`)) throw new Error(`Refusing to clean path outside repository: ${relative}`);
  try {
    await lstat(target);
    await rm(target, { recursive: true, force: true });
    console.log(`Removed generated output: ${relative}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log("Cleaned app caches and build outputs. Dependencies, native source, environment files, local.properties, and root Android artifacts were preserved.");
