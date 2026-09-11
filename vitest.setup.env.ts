// Les tests ne chargent jamais les secrets ni la base du .env de développement.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/snapsell_test";
process.env.ENCRYPTION_KEY ??= "a".repeat(64);
process.env.AUTH_SECRET ??= "b".repeat(32);
// Les intégrations Meta utilisent un fetch simulé et ces identifiants fictifs.
process.env.META_APP_ID ??= "test-meta-app";
process.env.META_APP_SECRET ??= "test-meta-secret";
if (process.env.RUN_INTEGRATION_TESTS === "true") {
  const url = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error("Les intégrations exigent une base locale dédiée dont le nom se termine par _test.");
  }
}
