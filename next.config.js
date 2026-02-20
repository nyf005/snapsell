/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  serverExternalPackages: [
    "@opentelemetry/instrumentation",
    "@sentry/node",
    "@sentry/node-core",
    "@sentry/nextjs",
    "require-in-the-middle",
  ],
};

export default config;
