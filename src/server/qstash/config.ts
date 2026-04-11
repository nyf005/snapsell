import { Receiver } from "@upstash/qstash";
import { env } from "~/env";

export function hasQStashConfig(): boolean {
  return Boolean(env.QSTASH_TOKEN);
}

export function hasQStashSigningKeys(): boolean {
  return Boolean(env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY);
}

export function isQStashMisconfiguredForHttpRoute(): boolean {
  return env.NODE_ENV === "production" && hasQStashConfig() && !hasQStashSigningKeys();
}

export function createQStashReceiver(): Receiver | null {
  if (!hasQStashSigningKeys()) return null;
  return new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY!,
  });
}
