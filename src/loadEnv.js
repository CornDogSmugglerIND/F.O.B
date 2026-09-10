/** Load gitignored .env into process.env (no dependency). Never logs values. */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function loadEnvFile(filePath = join(process.cwd(), ".env")) {
  if (!existsSync(filePath)) return { loaded: false, keys: [] };
  const text = readFileSync(filePath, "utf8");
  const keys = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = value;
      keys.push(key);
    }
  }
  return { loaded: true, keys };
}
