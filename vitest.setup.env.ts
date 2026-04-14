import fs from "node:fs";
import path from "node:path";

import { config } from "dotenv";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env");
const envLocalPath = path.join(cwd, ".env.local");

if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath });
}
if (fs.existsSync(envPath)) {
  config({ path: envPath, override: false });
}

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "a".repeat(64);
process.env.AUTH_SECRET = process.env.AUTH_SECRET || "b".repeat(32);
