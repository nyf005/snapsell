"use client";
import { useEffect, useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { formatErrorText } from "~/lib/copy";
export function LiveWaitlist() {
  const [cursor, setCursor] = useState<string>();
  const [items, setItems] = useState<RouterOutputs["live"]["getWaitlist"]["items"]>([]);
  const query = api.live.getWaitlist.useQuery({ cursor }, { refetchInterval: 15000 });
  useEffect(() => { if (query.data) { const next = query.data.items; setItems((prev) => cursor ? [...prev.filter((item) => !next.some((entry) => entry.id === item.id)), ...next] : next); } }, [query.data, cursor]);
  return <section id="live-waitlist" className="scroll-mt-4 space-y-3 rounded-xl border border-border bg-card p-4" aria-labelledby="waitlist-heading"><h2 id="waitlist-heading" className="text-lg font-semibold">Personnes en attente</h2><p className="text-sm text-muted-foreground">La première cliente de chaque article est appelée automatiquement lorsqu’une réservation se libère.</p>
    {query.error ? <div role="alert"><p>{formatErrorText(query.error, "generic")}</p><Button variant="outline" onClick={() => void query.refetch()}>Réessayer</Button></div> : query.isLoading ? <p>Chargement de la file…</p> : <ul className="divide-y divide-border">{items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="font-medium">{item.code}</span><span>{item.clientPhone}</span><span className="text-sm text-muted-foreground">Position {item.position}</span></li>)}</ul>}
    {query.data?.nextCursor && <Button variant="outline" onClick={() => setCursor(query.data?.nextCursor)}>Charger la suite de la file</Button>}
  </section>;
}
