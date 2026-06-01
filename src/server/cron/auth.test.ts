import { beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "~/env";
import { requireCronAuthorization } from "./auth";

vi.mock("~/env", () => ({
  env: {
    CRON_SECRET: "cron-secret",
  },
}));

function requestWithAuth(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/test", { headers });
}

describe("requireCronAuthorization", () => {
  beforeEach(() => {
    (env as Record<string, unknown>).CRON_SECRET = "cron-secret";
  });

  it("fails closed when CRON_SECRET is missing", () => {
    (env as Record<string, unknown>).CRON_SECRET = undefined;

    const response = requireCronAuthorization(requestWithAuth());

    expect(response?.status).toBe(503);
  });

  it("rejects missing or invalid bearer tokens", () => {
    expect(requireCronAuthorization(requestWithAuth())?.status).toBe(401);
    expect(requireCronAuthorization(requestWithAuth("Bearer wrong"))?.status).toBe(401);
  });

  it("allows the request when the bearer token matches CRON_SECRET", () => {
    const response = requireCronAuthorization(requestWithAuth("Bearer cron-secret"));

    expect(response).toBeNull();
  });
});
