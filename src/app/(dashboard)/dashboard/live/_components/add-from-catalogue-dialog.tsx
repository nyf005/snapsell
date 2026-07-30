"use client";

import { useMemo, useState } from "react";
import { PackageOpen, Search } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { formatErrorText, formatXof } from "~/lib/copy";
import { api } from "~/trpc/react";

/**
 * Ajouter au live un article déjà au catalogue.
 *
 * ── POURQUOI CET ÉCRAN MANQUAIT ─────────────────────────────────────────────
 * `live.addItemFromCatalogue` existait depuis longtemps — il hérite du code, du
 * stock et de la photo de l'article — et **aucune interface ne l'appelait**.
 * Pendant un live, il fallait donc retaper un article déjà enregistré, alors que
 * le téléphone sert à filmer.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La recherche se fait côté client sur la page chargée : c'est le même compromis
 * que la liste des commandes, et le catalogue d'une boutique se compte en dizaines
 * d'articles. Le serveur pagine déjà, la pagination reste disponible si besoin.
 */
export function AddFromCatalogueDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const utils = api.useUtils();

  const { data, isLoading } = api.catalogue.list.useQuery(
    { limit: 100 },
    { enabled: open },
  );

  const add = api.live.addItemFromCatalogue.useMutation({
    onSuccess: (liveItem) => {
      onAdded(`${liveItem.code} ajouté au live.`);
      onOpenChange(false);
      setSearch("");
      void utils.live.getLiveOpsData.invalidate();
      void utils.catalogue.list.invalidate();
    },
  });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((i) => i.code.toLowerCase().includes(q));
  }, [data?.items, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un article du catalogue</DialogTitle>
          <DialogDescription>
            Le code, le stock et la photo sont reprises du catalogue. Rien à ressaisir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <span className="relative block">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="add-from-catalogue-search"
              type="search"
              className="h-10 pl-10"
              placeholder="Chercher un code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Chercher un article du catalogue"
            />
          </span>

          {add.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {formatErrorText(add.error, "catalogue")}
            </p>
          ) : null}

          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <PackageOpen className="size-4 shrink-0" aria-hidden />
              {search.trim()
                ? "Aucun article ne correspond."
                : "Votre catalogue est vide pour l’instant."}
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const outOfStock = item.availableQty <= 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      // Le serveur refuse déjà un stock épuisé ; le dire ici évite
                      // de faire cliquer pour rien.
                      disabled={outOfStock || add.isPending}
                      onClick={() => add.mutate({ catalogueItemId: item.id })}
                      className="flex w-full min-h-12 items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <span className="flex flex-col">
                        <span className="text-sm font-bold text-foreground">{item.code}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.amount != null ? formatXof(item.amount) : "Prix par catégorie"}
                        </span>
                      </span>
                      <Badge variant={outOfStock ? "secondary" : "outline"}>
                        {outOfStock ? "Épuisé" : `${item.availableQty} en stock`}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Fermer
        </Button>
      </DialogContent>
    </Dialog>
  );
}
