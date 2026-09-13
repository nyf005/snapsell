import { ArrowDown, FileImage, MessageCircle } from "lucide-react";

/** A shortened fictional conversation, not a transcript or an interactive widget. */
export function WhatsappOrderVisual() {
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-sm">
        <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-4">
          <MessageCircle className="size-5 text-success" aria-hidden="true" />
          <div><p className="font-semibold">Boutique Awa</p><p className="text-xs text-muted-foreground">Conversation WhatsApp · exemple abrégé</p></div>
        </div>
        <ol className="space-y-3 p-4 text-sm leading-relaxed sm:p-5" aria-label="De la demande à la preuve de paiement">
          <li className="ml-8 rounded-2xl rounded-tr-sm bg-success/10 px-4 py-3"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Mariam</span>Bonjour, je prends SAC12.</li>
          <li className="mr-5 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3"><span className="mb-1 block text-xs font-semibold text-primary">Assistant SnapSell</span>Votre sac bandoulière est réservé. Quel est votre nom et votre adresse de livraison ?</li>
          <li className="ml-8 rounded-2xl rounded-tr-sm bg-success/10 px-4 py-3">Mariam, livraison à Cocody.</li>
          <li className="mr-5 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3"><span className="mb-1 block text-xs font-semibold text-primary">Assistant SnapSell</span>Merci ! Envoyez votre preuve de paiement pour l’acompte demandé.</li>
          <li className="ml-8 flex items-center gap-3 rounded-2xl rounded-tr-sm bg-success/10 px-4 py-3"><FileImage className="size-5 shrink-0 text-success" aria-hidden="true" /><span>Preuve de paiement envoyée</span></li>
        </ol>
      </div>
      <div className="flex items-center justify-center gap-2 py-3 text-xs font-medium text-muted-foreground"><ArrowDown className="size-4" aria-hidden="true" />Retrouvée dans vos commandes</div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-card p-4"><div><p className="font-semibold">SS-1042 · Mariam</p><p className="mt-1 text-sm text-muted-foreground">Sac bandoulière × 1 · SAC12</p></div><span className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-medium">Preuve à vérifier</span></div>
      <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">Exemple illustratif avec des données fictives. La réception d’une preuve ne valide pas le paiement : votre boutique le vérifie.</figcaption>
    </figure>
  );
}
