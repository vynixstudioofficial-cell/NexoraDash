import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/@electric-sql/pglite/dist");
const to = join(root, ".vercel/output/functions/__server.func/_libs");

if (!existsSync(to)) {
  console.log("[pglite] server output missing; skip asset copy");
  process.exit(0);
}

mkdirSync(to, { recursive: true });
for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  copyFileSync(join(from, name), join(to, name));
}
console.log("[pglite] copied runtime assets next to the server bundle");
