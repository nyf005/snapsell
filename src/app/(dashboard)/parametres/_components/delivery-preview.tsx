"use client";
import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { formatXof, formatErrorText } from "~/lib/copy";
export function DeliveryPreview() {
  const [commune, setCommune] = useState("");
  const [result, setResult] = useState<{ amount: number | null; label: string | null; source: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const utils = api.useUtils();
  return <form className="space-y-3 rounded-xl border border-border bg-card p-4" onSubmit={async (event) => { event.preventDefault(); setPending(true); setError(null); setResult(null); try { setResult(await utils.delivery.previewFee.fetch({ commune })); } catch (error) { setError(formatErrorText(error, "generic")); } finally { setPending(false); } }}>
    <label htmlFor="delivery-preview" className="block font-medium">Quel tarif sera appliqué ?</label>
    <div className="flex flex-wrap gap-2"><Input id="delivery-preview" className="min-h-11 min-w-40 flex-1" placeholder="Saisir une commune" maxLength={120} value={commune} onChange={(e) => { setCommune(e.target.value); setResult(null); }} /><Button disabled={pending || !commune.trim()}>{pending ? "Calcul…" : "Vérifier le tarif"}</Button></div>
    {result && <p role="status" className="text-sm">{result.amount === null ? "Aucun tarif configuré : montant à confirmer avec la cliente." : `${formatXof(result.amount)} · ${result.source === "commune" ? "Tarif spécifique" : result.source === "fallback-zone" ? "Zone de repli" : "Zone"} : ${result.label}`}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </form>;
}
