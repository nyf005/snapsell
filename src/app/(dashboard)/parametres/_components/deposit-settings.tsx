"use client";
import { useEffect, useState } from "react";
import { UnsavedChangesDialog } from "~/components/ui/unsaved-changes-dialog";
import { useUnsavedChanges } from "~/hooks/use-unsaved-changes";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { formatErrorText, formatXofUnits } from "~/lib/copy";
export function DepositSettings() {
  const query = api.settings.getDepositSettings.useQuery();
  const [enabled, setEnabled] = useState(false);
  const [percent, setPercent] = useState("30");
  const [dirty, setDirty] = useState(false);
  const unsavedChanges = useUnsavedChanges(dirty);
  useEffect(() => { if (query.data && !dirty) { setEnabled(query.data.requireDeposit); setPercent(String(query.data.depositPercent ?? 30)); } }, [query.data, dirty]);
  const save = api.settings.setDepositSettings.useMutation({ onSuccess: async () => { await query.refetch(); setDirty(false); } });
  const valid = Number.isInteger(Number(percent)) && Number(percent) >= 1 && Number(percent) <= 100;
  return <section className="space-y-4 rounded-xl border border-border bg-card p-4" aria-labelledby="deposit-heading">
    <UnsavedChangesDialog {...unsavedChanges} />
    <div className="flex items-center justify-between gap-3"><div><h2 id="deposit-heading" className="font-semibold">Acompte avant préparation</h2><p className="mt-1 text-sm text-muted-foreground">Pour les nouvelles commandes, hors frais de livraison.</p></div><Switch aria-label="Demander un acompte" checked={enabled} disabled={query.isLoading || !!query.error || save.isPending} onCheckedChange={(value) => { setEnabled(value); setDirty(true); }} /></div>
    {query.isLoading ? <p>Chargement du réglage…</p> : query.error ? <div role="alert"><p>{formatErrorText(query.error, "generic")}</p><Button onClick={() => void query.refetch()}>Réessayer</Button></div> : <>
      <p className="text-sm text-muted-foreground">{query.data?.depositPercent == null ? "Aucun pourcentage enregistré. Enregistrez votre règle pour calculer les prochains acomptes." : `Règle enregistrée : ${query.data.depositPercent} % des articles. Les commandes existantes conservent leur montant.`}</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end"><div className="grid gap-2"><label htmlFor="deposit-percent" className="text-sm font-medium">Pourcentage de l’acompte (%)</label><Input id="deposit-percent" className="w-full sm:w-32" type="number" min={1} max={100} value={percent} onChange={(event) => { setPercent(event.target.value); setDirty(true); }} /></div><Button className="w-full sm:w-auto" disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate({ requireDeposit: enabled, depositPercent: Number(percent) })}>{save.isPending ? "Enregistrement…" : "Enregistrer la règle"}</Button></div>
      {enabled && <p className="text-sm text-muted-foreground">Exemple : sur 10 000 FCFA d’articles, l’acompte sera de {valid ? formatXofUnits(10000 * Number(percent) / 100) : "…"}. Arrondi au franc supérieur.</p>}
      {save.isError && <p role="alert" className="text-sm text-destructive">{formatErrorText(save.error, "generic")}</p>}
      {save.isSuccess && !dirty && <p role="status" className="text-sm text-success">Règle d’acompte enregistrée.</p>}
    </>}
  </section>;
}
