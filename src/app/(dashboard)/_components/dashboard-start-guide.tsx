"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { CheckCircle2, Package, Play } from "lucide-react";

export function DashboardStartGuide({ hasLiveSession }: { hasLiveSession: boolean }) {
  return (
    <Card className="border-primary/20 bg-primary/5 shadow-sm">
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-lg font-bold">Démarrez votre activité rapidement</CardTitle>
            <CardDescription className="max-w-2xl">
              Ajoutez vos premiers produits, lancez une session live et suivez les commandes en temps réel.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="sm" variant="secondary" className="font-semibold">
              <Link href="/dashboard/catalogue" prefetch>Ajouter un article</Link>
            </Button>
            <Button asChild size="sm" className="font-semibold">
              <Link href="/dashboard/live" prefetch>Voir le live</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Package className="size-5" />
              </div>
              <div>
                <p className="font-semibold">1. Ajouter des articles</p>
                <p className="text-sm text-muted-foreground">Créez votre catalogue avec des codes, prix et stock.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                <Play className="size-5" />
              </div>
              <div>
                <p className="font-semibold">2. Lancer une session live</p>
                <p className="text-sm text-muted-foreground">Ouvrez la session pour rendre vos articles commandables.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <p className="font-semibold">3. Suivre les commandes</p>
                <p className="text-sm text-muted-foreground">Traitez les réservations et préparez les livraisons au bon moment.</p>
              </div>
            </div>
          </div>
        </div>

        {!hasLiveSession ? (
          <div className="rounded-2xl border border-border bg-muted/10 p-4 text-sm text-muted-foreground">
            Votre session live est inactive. Lancez-la dès que votre catalogue est prêt.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-muted/10 p-4 text-sm text-muted-foreground">
            Votre session live est active. Allez sur Live Ops pour suivre les réservations et le stock.</div>
        )}
      </CardContent>
    </Card>
  );
}
