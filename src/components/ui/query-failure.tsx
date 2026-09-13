"use client";
import { Button } from "./button";
import { formatErrorText } from "~/lib/copy";
export function QueryFailure({ error, retry, title = "Impossible de charger ces informations" }: { error: unknown; retry: () => unknown; title?: string }) {
  return <div role="alert" className="space-y-3 rounded-xl border border-destructive/20 bg-card p-5"><p className="font-semibold">{title}</p><p className="max-w-prose text-sm text-muted-foreground">{formatErrorText(error, "generic")}</p><Button variant="outline" onClick={() => void retry()}>Réessayer</Button></div>;
}
