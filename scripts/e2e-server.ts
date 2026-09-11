import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// Next charge .env automatiquement : neutraliser explicitement toutes les variables
// applicatives avant de lancer un serveur de test, pour ne contacter aucun service réel.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL de test requis");
const url = new URL(databaseUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
  throw new Error("Le navigateur exige une base locale dédiée suffixée _test");
}
const childEnv = { ...process.env };
for (const match of readFileSync("src/env.js", "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
  childEnv[match[1]!] = "";
}
Object.assign(childEnv, {
  DATABASE_URL: databaseUrl, NODE_ENV: "production", PG_BOSS_ROLE: "producer",
  AUTH_SECRET: "snapsell-browser-test-secret-only", AUTH_TRUST_HOST: "true",
  ENCRYPTION_KEY: "a".repeat(64), CRON_SECRET: "snapsell-browser-test-cron",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100", NEXT_TELEMETRY_DISABLED: "1",
});
const args = process.argv.includes("--build") ? ["build"] : ["start", "--hostname", "127.0.0.1", "--port", "3100"];
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { env: childEnv, stdio: "inherit" });
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 1));
