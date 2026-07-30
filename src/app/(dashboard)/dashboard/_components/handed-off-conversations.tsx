"use client";

import { Undo2, UserRound } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatDateTime, formatErrorText } from "~/lib/copy";
import { api } from "~/trpc/react";

/**
 * Les conversations où une personne a pris le relais, et le bouton pour rendre
 * la main au robot.
 *
 * ── POURQUOI CET ÉCRAN EXISTE ───────────────────────────────────────────────
 * `setHandedOff` n'était appelé qu'avec `true` : une conversation basculée ne
 * revenait jamais au robot, et un faux positif de détection — « je t'appelle
 * demain » suffisait — coupait le service à une cliente sans que personne le sache.
 *
 * Le webhook rend désormais la main tout seul après 24 h. Ceci sert à le faire
 * plus tôt, et surtout à *voir* quelles conversations sont concernées.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La section disparaît quand il n'y a rien à reprendre : elle n'occupe la place
 * de l'écran « Aujourd'hui » que lorsqu'elle porte du travail réel.
 */
export function HandedOffConversations() {
  const utils = api.useUtils();
  const { data: conversations = [] } = api.conversations.listHandedOff.useQuery();

  const handBack = api.conversations.handBackToBot.useMutation({
    onSuccess: () => {
      void utils.conversations.listHandedOff.invalidate();
    },
  });

  if (conversations.length === 0) return null;

  return (
    <Card className="min-w-0 border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <UserRound className="size-4 text-muted-foreground" aria-hidden />
          Conversations suivies à la main
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          L’assistant s’est mis en retrait sur ces numéros. Rendez-lui la main quand
          vous avez terminé — sinon il la reprend seul au bout de 24 heures.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {handBack.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {formatErrorText(handBack.error, "orders")}
          </p>
        ) : null}

        <ul className="space-y-2">
          {conversations.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
            >
              <span className="flex flex-col">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {c.phoneMasked}
                </span>
                <span className="text-xs text-muted-foreground">
                  Depuis le {formatDateTime(c.since)}
                </span>
              </span>

              <span className="flex items-center gap-2">
                {c.expired ? (
                  // Le webhook rendra la main au prochain message : le dire évite
                  // de se demander pourquoi la ligne a disparu toute seule.
                  <Badge variant="secondary">Reprise automatique imminente</Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={handBack.isPending}
                  aria-label={`Rendre la conversation ${c.phoneMasked} à l’assistant`}
                  onClick={() => handBack.mutate({ phone: c.phone })}
                >
                  <Undo2 className="size-4" aria-hidden />
                  Rendre à l’assistant
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
