"use client";

import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { formatPriceFCFA } from "~/lib/subscription-plans";

interface Payment {
  id: string;
  type: string;
  plan: string | null;
  amount: number;
  currency: string;
  status: string;
  channel: string | null;
  cardLast4: string | null;
  overageDetails: unknown;
  createdAt: Date;
}

interface PaymentHistoryProps {
  data: Payment[];
  isLoading: boolean;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  success: {
    label: "Réussi",
    className: "bg-green-500/10 text-green-600 border-green-500/20",
  },
  pending: {
    label: "En attente",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
  failed: {
    label: "Échoué",
    className: "bg-red-500/10 text-red-600 border-red-500/20",
  },
};

const typeBadge: Record<string, { label: string; className: string }> = {
  subscription: {
    label: "Abonnement",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  overage: {
    label: "Overage",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
};

export function PaymentHistory({ data, isLoading }: PaymentHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-bold">Historique des paiements</h2>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun paiement enregistré.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left font-medium">Date</th>
                  <th className="px-2 py-2 text-left font-medium">Type</th>
                  <th className="px-2 py-2 text-left font-medium">Plan</th>
                  <th className="px-2 py-2 text-right font-medium">Montant</th>
                  <th className="px-2 py-2 text-left font-medium">Moyen</th>
                  <th className="px-2 py-2 text-left font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.map((payment) => {
                  // Non-null assertions on known-safe fallback keys
                  const typeConf = typeBadge[payment.type] ?? typeBadge["subscription"]!;
                  const statusConf =
                    statusBadge[payment.status] ?? statusBadge["pending"]!;

                  return (
                    <tr
                      key={payment.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-2 py-3 whitespace-nowrap">
                        {new Date(payment.createdAt).toLocaleDateString(
                          "fr-FR",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <Badge
                          variant="outline"
                          className={typeConf.className}
                        >
                          {typeConf.label}
                        </Badge>
                      </td>
                      <td className="px-2 py-3 capitalize">
                        {payment.plan ?? "—"}
                      </td>
                      <td className="px-2 py-3 text-right font-medium">
                        {formatPriceFCFA(payment.amount)}
                      </td>
                      <td className="px-2 py-3">
                        {payment.channel === "card" && payment.cardLast4
                          ? `Carte •••• ${payment.cardLast4}`
                          : payment.channel ?? "—"}
                      </td>
                      <td className="px-2 py-3">
                        <Badge
                          variant="outline"
                          className={statusConf.className}
                        >
                          {statusConf.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
