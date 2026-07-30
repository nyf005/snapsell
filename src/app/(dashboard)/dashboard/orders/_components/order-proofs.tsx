"use client";

import { FileCheck, ImageOff } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { formatDateTime } from "~/lib/copy";
import { proofStatusLabel } from "~/lib/copy/orders";
import type { OrderOutput } from "~/server/api/routers/orders.schema";

/**
 * Les preuves d'acompte d'une commande.
 *
 * ── POURQUOI CE COMPOSANT EXISTE ────────────────────────────────────────────
 * `proofs.listPending` ne montrait que les preuves en attente, et c'était le seul
 * listing du produit : une fois validée, une preuve sortait définitivement de
 * l'interface. Pour vérifier l'acompte d'une commande en préparation, il fallait
 * l'avoir mémorisée avant de la valider — donc en pratique, c'était impossible.
 *
 * Or l'aide promet de pouvoir trancher une contestation, et une contestation
 * d'acompte porte sur l'image. D'où cette vue, servie partout où une commande est
 * lue : la boîte ouverte depuis le badge, et le panneau de détail.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Une commande peut porter **plusieurs** preuves — une photo illisible puis une
 * bonne. Elles sont donc listées dans l'ordre d'arrivée, et non réduites à la
 * dernière : c'est la succession qui raconte ce qui s'est passé.
 */

type Proof = OrderOutput["proofs"][number];

/** Teinte du badge par statut. Le libellé vient de `proofStatusLabel`. */
const PROOF_STATUS_TINT: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function ProofStatusBadge({ status }: { status: string }) {
  const tint = PROOF_STATUS_TINT[status];
  if (!tint) return null;
  return (
    <Badge variant="secondary" className={`w-fit ${tint}`}>
      {proofStatusLabel(status)}
    </Badge>
  );
}

function ProofCard({ proof, orderNumber }: { proof: Proof; orderNumber: string }) {
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <ProofStatusBadge status={proof.status} />
        <span className="text-xs text-muted-foreground">
          Reçue le {formatDateTime(proof.createdAt)}
        </span>
      </div>

      {proof.kind === "image" ? (
        // Le média passe par `/api/proofs/[proofId]/media`, qui vérifie la session
        // et l'appartenance au tenant. Aucune URL publique n'est exposée.
        <a
          href={`/api/proofs/${proof.id}/media`}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg border border-border bg-muted"
        >
          <img
            src={`/api/proofs/${proof.id}/media`}
            alt={`Preuve de paiement pour la commande ${orderNumber}`}
            className="max-h-80 w-full object-contain"
          />
        </a>
      ) : proof.kind === "text" ? (
        <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-foreground">
          {proof.text}
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          <ImageOff className="size-4 shrink-0" aria-hidden />
          Cette preuve est arrivée sans image ni texte.
        </p>
      )}

      {proof.reviewedAt ? (
        <p className="pt-2 text-xs text-muted-foreground">
          Traitée le {formatDateTime(proof.reviewedAt)}
        </p>
      ) : null}
    </li>
  );
}

export function OrderProofs({
  proofs,
  orderNumber,
}: {
  proofs: readonly Proof[];
  orderNumber: string;
}) {
  if (proofs.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
        <FileCheck className="size-4 shrink-0" aria-hidden />
        Aucune preuve n’a été envoyée pour cette commande.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {proofs.map((proof) => (
        <ProofCard key={proof.id} proof={proof} orderNumber={orderNumber} />
      ))}
    </ul>
  );
}
