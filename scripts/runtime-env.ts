import fs from "node:fs";
import path from "node:path";

import { config } from "dotenv";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env");
const envLocalPath = path.join(cwd, ".env.local");
const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  if (fs.existsSync(envPath)) {
    config({ path: envPath });
  }
} else {
  if (fs.existsSync(envLocalPath)) {
    config({ path: envLocalPath });
  }
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}
