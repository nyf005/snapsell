import { Search, SlidersHorizontal } from "lucide-react";
import { orderStatusLabel } from "~/lib/copy/orders";

const orders = [
  { reference: "SS-1042", phone: "+225 07 •• •• •• 42", article: "Sac bandoulière × 1", code: "SAC12", amount: "22 000 FCFA", deposit: "5 000 FCFA", payment: "Preuve à vérifier", status: "confirmed_pending_deposit", action: "Vérifier le paiement", review: true },
  { reference: "SS-1041", phone: "+225 07 •• •• •• 41", article: "Robe fleurie × 1", code: "ROB08", amount: "15 000 FCFA", deposit: "5 000 FCFA", payment: "Acompte validé", status: "confirmed", action: "Préparer", review: false },
];

export function CoreSection() {
  return (
    <section id="fonctionnement" className="bg-muted/40 px-5 py-12 sm:px-6 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 max-w-2xl"><p className="mb-3 text-sm font-semibold text-primary">Côté vendeur</p><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Vous voyez tout de suite quoi faire.</h2><p className="mt-4 text-lg leading-relaxed text-muted-foreground">La preuve de Mariam vous attend dans la commande SS-1042. Vérifiez son paiement ; les commandes déjà confirmées peuvent passer en préparation.</p></div>
        <figure>
          <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            <div className="p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-2xl font-bold">Commandes</p><div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex" aria-hidden="true"><span className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"><Search className="size-4" />N° commande, client, article…</span><span className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"><SlidersHorizontal className="size-4" />Affiner</span></div></div>
              <div className="mt-5 flex border-b border-border text-sm font-semibold">{["À traiter", "En cours", "Terminées"].map((label, index) => <span key={label} className={`flex min-h-12 flex-1 items-center justify-center gap-2 border-b-2 px-2 sm:flex-none sm:px-6 ${index === 0 ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{label}{index === 0 && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">2</span>}</span>)}</div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-border px-3 py-2">Paiements à vérifier · 1</span><span className="rounded-full border border-border px-3 py-2">À préparer · 1</span></div>
            </div>
            <div className="hidden grid-cols-[1.1fr_1.2fr_1fr_1fr_1.1fr] gap-4 border-y border-border bg-muted/40 px-6 py-3 text-sm text-muted-foreground lg:grid" aria-hidden="true">{["Commande / Client", "Articles", "Paiement", "Statut", "Action"].map(label => <span key={label}>{label}</span>)}</div>
            <ul className="divide-y divide-border">{orders.map(order => <li key={order.reference} className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.1fr_1.2fr_1fr_1fr_1.1fr] lg:items-center">
              <div><p className="font-bold text-primary">{order.reference}</p><p className="mt-1 text-sm">{order.phone}</p></div>
              <div><p className="text-sm font-medium">{order.article}</p><p className="text-xs text-muted-foreground">{order.code}</p><p className="mt-1 text-sm text-muted-foreground">{order.amount} hors livraison</p></div>
              <div><span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${order.review ? "bg-warning/15" : "bg-success/10"}`}>{order.payment}</span><p className="mt-2 text-sm">Acompte : {order.deposit}</p></div>
              <div><span className="inline-block rounded-full bg-muted px-2.5 py-1 text-xs">{orderStatusLabel(order.status)}</span></div>
              <span className="rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-medium text-primary-foreground">{order.action}</span>
            </li>)}</ul>
          </div>
          <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">Aperçu simplifié de la page Commandes, avec des données fictives et des numéros masqués. Les contrôles illustrés ne sont pas interactifs.</figcaption>
        </figure>
      </div>
    </section>
  );
}
