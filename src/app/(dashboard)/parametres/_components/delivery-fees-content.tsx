"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MapPin, Building2, Pencil, Plus, Save, Trash2 } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Button } from "~/components/ui/button";
import { Card, CardDescription } from "~/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";

import { Label } from "~/components/ui/label";
import { DataPagination } from "~/components/ui/data-pagination";
import { DeliveryFeesSkeleton } from "./delivery-fees-skeletons";
import { api } from "~/trpc/react";
import { ErrorAlert } from "~/components/ui/error-alert";
import { formatError, formatXof, pluralize, ui, type UserError } from "~/lib/copy";
import { DataList } from "~/components/ui/data-list";
import { findOverriddenCommunes } from "~/lib/delivery/resolve-delivery-fee";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";

type ZoneOutput = RouterOutputs["delivery"]["getDeliveryZones"]["items"][number];
type CommuneOutput = RouterOutputs["delivery"]["getDeliveryFeeCommunes"]["items"][number];

type ZoneRow = {
  id: string;
  name: string;
  amount: number;
  communeNames: string[];
  updatedAt: Date;
};

type CommuneRow = {
  id: string;
  communeName: string;
  amount: number;
  updatedAt: Date;
};

const PAGE_SIZE = 10;

const emptyZoneForm = { name: "", amount: 0, communeNamesText: "" };
const emptyCommuneForm = { communeName: "", amount: 0 };

export function DeliveryFeesContent() {
  const [zoneError, setZoneError] = useState<UserError | null>(null);
  const [communeError, setCommuneError] = useState<UserError | null>(null);
  const [zoneCursor, setZoneCursor] = useState<string | undefined>(undefined);
  const [communeCursor, setCommuneCursor] = useState<string | undefined>(undefined);
  const [accumulatedZones, setAccumulatedZones] = useState<ZoneOutput[]>([]);
  const [accumulatedCommunes, setAccumulatedCommunes] = useState<CommuneOutput[]>([]);
  const [openZoneModal, setOpenZoneModal] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState(emptyZoneForm);
  const [zoneToDelete, setZoneToDelete] = useState<string | null>(null);
  const [openCommuneModal, setOpenCommuneModal] = useState(false);
  const [editingCommuneName, setEditingCommuneName] = useState<string | null>(null);
  const [communeForm, setCommuneForm] = useState(emptyCommuneForm);
  const [communeToDelete, setCommuneToDelete] = useState<string | null>(null);

  const utils = api.useUtils();

  const zonesQuery = useMemo(() => ({ limit: PAGE_SIZE, cursor: zoneCursor }), [zoneCursor]);
  const communesQuery = useMemo(() => ({ limit: PAGE_SIZE, cursor: communeCursor }), [communeCursor]);

  const { data: zonesData, isLoading: zonesLoading } = api.delivery.getDeliveryZones.useQuery(zonesQuery);
  const { data: communesData, isLoading: communesLoading } = api.delivery.getDeliveryFeeCommunes.useQuery(communesQuery);

  useEffect(() => {
    if (!zonesData?.items) return;
    const items = zonesData.items as ZoneOutput[];
    if (!zoneCursor) {
      setAccumulatedZones(items);
    } else {
      setAccumulatedZones((prev) => [...prev, ...items]);
    }
  }, [zonesData?.items, zoneCursor]);

  useEffect(() => {
    if (!communesData?.items) return;
    const items = communesData.items as CommuneOutput[];
    if (!communeCursor) {
      setAccumulatedCommunes(items);
    } else {
      setAccumulatedCommunes((prev) => [...prev, ...items]);
    }
  }, [communesData?.items, communeCursor]);

  const zones = accumulatedZones;
  const communes = accumulatedCommunes;

  /** Communes présentes à la fois dans une zone et dans la table par commune. */
  const overriddenCommunes = useMemo(
    () =>
      findOverriddenCommunes(
        zones.map((z) => ({
          name: z.name,
          amount: z.amount,
          communes: z.communeNames ?? [],
        })),
        communes.map((c) => ({ communeName: c.communeName, amount: c.amount })),
      ),
    [zones, communes],
  );

  /** Communes déjà connues — alimente l'autocomplétion, pour éviter les fautes de
   *  frappe qui font silencieusement échouer la correspondance. */
  const knownCommuneNames = useMemo(() => {
    const all = [
      ...zones.flatMap((z) => z.communeNames ?? []),
      ...communes.map((c) => c.communeName),
    ];
    return [...new Set(all)].sort((a, b) => a.localeCompare(b, "fr"));
  }, [zones, communes]);
  const zonesNextCursor = zonesData?.nextCursor;
  const communesNextCursor = communesData?.nextCursor;
  const hasMoreZones = Boolean(zonesNextCursor);
  const hasMoreCommunes = Boolean(communesNextCursor);

  const loadMoreZones = () => {
    if (zonesNextCursor) setZoneCursor(zonesNextCursor);
  };

  const loadMoreCommunes = () => {
    if (communesNextCursor) setCommuneCursor(communesNextCursor);
  };

  const upsertZone = api.delivery.upsertDeliveryZone.useMutation({
    onSuccess: () => {
      setZoneError(null);
      setOpenZoneModal(false);
      setEditingZoneId(null);
      setZoneForm(emptyZoneForm);
      void utils.delivery.getDeliveryZones.invalidate();
    },
    onError: (e) => setZoneError(formatError(e, "delivery")),
  });
  const deleteZone = api.delivery.deleteDeliveryZone.useMutation({
    onSuccess: () => {
      setZoneToDelete(null);
      void utils.delivery.getDeliveryZones.invalidate();
    },
    onError: (e) => setZoneError(formatError(e, "delivery")),
  });

  const upsertCommune = api.delivery.upsertDeliveryFeeCommune.useMutation({
    onSuccess: () => {
      setCommuneError(null);
      setOpenCommuneModal(false);
      setEditingCommuneName(null);
      setCommuneForm(emptyCommuneForm);
      void utils.delivery.getDeliveryFeeCommunes.invalidate();
    },
    onError: (e) => setCommuneError(formatError(e, "delivery")),
  });
  const deleteCommune = api.delivery.deleteDeliveryFeeCommune.useMutation({
    onSuccess: () => {
      setCommuneToDelete(null);
      void utils.delivery.getDeliveryFeeCommunes.invalidate();
    },
    onError: (e) => setCommuneError(formatError(e, "delivery")),
  });

  const openAddZone = useCallback(() => {
    setEditingZoneId(null);
    setZoneForm(emptyZoneForm);
    setOpenZoneModal(true);
  }, []);
  const openEditZone = useCallback((z: ZoneRow) => {
    setEditingZoneId(z.id);
    setZoneForm({
      name: z.name,
      amount: z.amount,
      communeNamesText: z.communeNames.join("\n"),
    });
    setOpenZoneModal(true);
  }, []);

  const saveZone = useCallback(() => {
    const names = zoneForm.communeNamesText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    upsertZone.mutate({
      ...(editingZoneId ? { id: editingZoneId } : {}),
      name: zoneForm.name.trim(),
      amount: zoneForm.amount,
      communeNames: names,
    });
  }, [editingZoneId, zoneForm, upsertZone]);

  const openAddCommune = useCallback(() => {
    setEditingCommuneName(null);
    setCommuneForm(emptyCommuneForm);
    setOpenCommuneModal(true);
  }, []);
  const openEditCommune = useCallback((c: CommuneRow) => {
    setEditingCommuneName(c.communeName);
    setCommuneForm({
      communeName: c.communeName,
      amount: c.amount,
    });
    setOpenCommuneModal(true);
  }, []);

  const saveCommune = useCallback(() => {
    upsertCommune.mutate({
      communeName: communeForm.communeName.trim(),
      amount: communeForm.amount,
    });
  }, [communeForm, upsertCommune]);

  const confirmDeleteZone = useCallback(() => {
    if (zoneToDelete) {
      deleteZone.mutate({ zoneId: zoneToDelete });
    }
  }, [zoneToDelete, deleteZone]);
  const confirmDeleteCommune = useCallback(() => {
    if (communeToDelete) {
      deleteCommune.mutate({ communeName: communeToDelete });
    }
  }, [communeToDelete, deleteCommune]);

  return (
    <>
      <DashboardHeader />
      <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-4 md:p-8">
        <TaskPageHeader
          href="/parametres/livraison"
        />

        {/* La préséance était appliquée nulle part et expliquée nulle part.
            Elle vient maintenant de src/lib/delivery/resolve-delivery-fee.ts. */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {ui.delivery.precedence}
        </div>

        {overriddenCommunes.length > 0 && (
          <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            {overriddenCommunes.map((o) => (
              <p key={o.communeName} className="text-sm text-foreground">
                {ui.delivery.duplicateWarning(
                  o.communeName,
                  formatXof(o.communeAmount),
                  formatXof(o.zoneAmount),
                )}
              </p>
            ))}
          </div>
        )}

        {/* Par zone */}
        <div>
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Par zone</h3>
              <CardDescription>Un prix pour un groupe de communes (ex. Abidjan, Intérieur du pays).</CardDescription>
            </div>
            <Button onClick={openAddZone} className="gap-2 shrink-0" size="default">
              <Plus className="size-4" />
              Ajouter une zone
            </Button>
          </div>
          {zoneError && <ErrorAlert error={zoneError} className="mb-4" />}
          <Card className="overflow-hidden rounded-2xl border-border pb-0 pt-0 shadow-sm">
            {zonesLoading ? (
              <div className="p-6">
                <DeliveryFeesSkeleton />
              </div>
            ) : (
              <>
                <DataList
                  items={zones}
                  getKey={(z) => z.id}
                  label="Zones de livraison"
                  columns={[
                    {
                      id: "name",
                      header: "Zone",
                      role: "primary",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 font-medium",
                      cell: (z) => z.name,
                    },
                    {
                      id: "amount",
                      header: "Prix",
                      role: "secondary",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 tabular-nums",
                      cell: (z) => formatXof(z.amount),
                    },
                    {
                      id: "communes",
                      header: "Communes",
                      role: "meta",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 text-sm text-muted-foreground",
                      cell: (z) =>
                        `${pluralize(z.communeNames.length, "commune")}${
                          z.communeNames.length === 0
                            ? ""
                            : z.communeNames.length <= 5
                              ? ` (${z.communeNames.join(", ")})`
                              : ` (${z.communeNames.slice(0, 3).join(", ")}…)`
                        }`,
                    },
                  ]}
                  actions={(z) => (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditZone(z)}
                        aria-label="Modifier"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setZoneToDelete(z.id)}
                        aria-label="Supprimer"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                  empty={
                    <Empty className="mx-auto max-w-sm border-0 p-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon" className="size-14 rounded-2xl [&_svg]:size-7">
                          <MapPin />
                        </EmptyMedia>
                        <EmptyTitle>Aucune zone</EmptyTitle>
                        <EmptyDescription>
                          Ajoutez une zone (ex. Abidjan) et listez les noms des communes.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  }
                />
                {zones.length > 0 && (
                  <DataPagination
                    totalItems={zones.length}
                    pageSize={PAGE_SIZE}
                    itemLabel={`zone${zones.length > 1 ? "s" : ""}`}
                    onNext={loadMoreZones}
                    hasNext={hasMoreZones}
                    isLoading={zonesLoading}
                  />
                )}
              </>
            )}
          </Card>
        </div>

        {/* Par commune */}
        <div>
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Par commune</h3>
              <CardDescription>Prix pour une commune précise (nom, ex. Cocody, Bouaké).</CardDescription>
            </div>
            <Button onClick={openAddCommune} className="gap-2 shrink-0" size="default">
              <Plus className="size-4" />
              Ajouter une commune
            </Button>
          </div>
          {communeError && <ErrorAlert error={communeError} className="mb-4" />}
          <Card className="overflow-hidden rounded-2xl border-border pb-0 pt-0 shadow-sm">
            {communesLoading ? (
              <div className="p-6">
                <DeliveryFeesSkeleton />
              </div>
            ) : (
              <>
                <DataList
                  items={communes}
                  getKey={(c) => c.id}
                  label="Prix par commune"
                  columns={[
                    {
                      id: "commune",
                      header: "Commune",
                      role: "primary",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 font-medium",
                      cell: (c) => c.communeName,
                    },
                    {
                      id: "amount",
                      header: "Prix",
                      role: "secondary",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 tabular-nums",
                      cell: (c) => formatXof(c.amount),
                    },
                  ]}
                  actions={(c) => (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditCommune(c)}
                        aria-label="Modifier"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCommuneToDelete(c.communeName)}
                        aria-label="Supprimer"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                  empty={
                    <Empty className="mx-auto max-w-sm border-0 p-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon" className="size-14 rounded-2xl [&_svg]:size-7">
                          <Building2 />
                        </EmptyMedia>
                        <EmptyTitle>Aucun prix par commune</EmptyTitle>
                        <EmptyDescription>
                          Ajoutez un tarif pour une commune précise (ex. Cocody, Bouaké).
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  }
                />
                {communes.length > 0 && (
                  <DataPagination
                    totalItems={communes.length}
                    pageSize={PAGE_SIZE}
                    itemLabel={`commune${communes.length > 1 ? "s" : ""}`}
                    onNext={loadMoreCommunes}
                    hasNext={hasMoreCommunes}
                    isLoading={communesLoading}
                  />
                )}
              </>
            )}
          </Card>
        </div>

        {/* Modal Zone */}
        <Dialog
          open={openZoneModal}
          onOpenChange={(open) => {
            if (!open) {
              setOpenZoneModal(false);
              setZoneForm(emptyZoneForm);
              setEditingZoneId(null);
            }
          }}
        >
          <DialogContent variant="sheet-on-mobile" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingZoneId ? "Modifier la zone" : "Nouvelle zone"}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Nom de la zone (ex. Abidjan, Intérieur du pays), prix en FCFA, et noms des communes (un par ligne ou séparés par une virgule).
              </p>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="zone-name">Nom de la zone</Label>
                <Input
                  id="zone-name"
                  placeholder="ex. Abidjan, Intérieur du pays"
                  value={zoneForm.name}
                  onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="zone-amount">Prix (FCFA)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">F</span>
                  <Input
                    id="zone-amount"
                    type="text"
                    inputMode="numeric"
                    className="pl-8"
                    placeholder="0"
                    value={zoneForm.amount === 0 ? "" : (zoneForm.amount / 100).toString()}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      const num = parseInt(v, 10);
                      setZoneForm((f) => ({
                        ...f,
                        amount: Number.isNaN(num) ? 0 : num * 100,
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="zone-communes">Noms des communes (un par ligne ou séparés par virgule)</Label>
                {knownCommuneNames.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Déjà utilisées : {knownCommuneNames.slice(0, 8).join(", ")}
                    {knownCommuneNames.length > 8 ? "…" : ""}
                  </p>
                )}
                <textarea
                  id="zone-communes"
                  placeholder={"Cocody\nMarcory\nYopougon\nTreichville"}
                  rows={4}
                  value={zoneForm.communeNamesText}
                  onChange={(e) => setZoneForm((f) => ({ ...f, communeNamesText: e.target.value }))}
                  className={cn(
                    "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
                  )}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenZoneModal(false)}>
                Annuler
              </Button>
              <Button
                onClick={saveZone}
                disabled={!zoneForm.name.trim() || upsertZone.isPending}
                className="gap-2"
              >
                <Save className="size-4" />
                {upsertZone.isPending ? "Enregistrement…" : editingZoneId ? "Enregistrer" : "Ajouter"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Commune */}
        <Dialog
          open={openCommuneModal}
          onOpenChange={(open) => {
            if (!open) {
              setOpenCommuneModal(false);
              setCommuneForm(emptyCommuneForm);
              setEditingCommuneName(null);
            }
          }}
        >
          <DialogContent variant="sheet-on-mobile" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCommuneName ? "Modifier la commune" : "Nouvelle commune"}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Nom de la commune (ex. Cocody, Bouaké) et prix en FCFA.
              </p>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="commune-name">Nom de la commune</Label>
                <Input
                  id="commune-name"
                  placeholder="ex. Cocody, Marcory, Bouaké"
                  value={communeForm.communeName}
                  onChange={(e) => setCommuneForm((f) => ({ ...f, communeName: e.target.value }))}
                  disabled={!!editingCommuneName}
                  list="known-communes"
                  autoComplete="off"
                />
                {/* Autocomplétion des communes déjà saisies : une faute de frappe
                    casse silencieusement la correspondance des frais. */}
                <datalist id="known-communes">
                  {knownCommuneNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="commune-amount">Prix (FCFA)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">F</span>
                  <Input
                    id="commune-amount"
                    type="text"
                    inputMode="numeric"
                    className="pl-8"
                    placeholder="0"
                    value={communeForm.amount === 0 ? "" : (communeForm.amount / 100).toString()}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      const num = parseInt(v, 10);
                      setCommuneForm((f) => ({
                        ...f,
                        amount: Number.isNaN(num) ? 0 : num * 100,
                      }));
                    }}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCommuneModal(false)}>
                Annuler
              </Button>
              <Button
                onClick={saveCommune}
                disabled={!communeForm.communeName.trim() || upsertCommune.isPending}
                className="gap-2"
              >
                <Save className="size-4" />
                {upsertCommune.isPending ? "Enregistrement…" : editingCommuneName ? "Enregistrer" : "Ajouter"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Alert delete zone */}
        <AlertDialog open={!!zoneToDelete} onOpenChange={() => setZoneToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer la zone ?</AlertDialogTitle>
              <AlertDialogDescription>
                La zone et la liste des communes associées seront supprimées. Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteZone} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Alert delete commune */}
        <AlertDialog open={!!communeToDelete} onOpenChange={() => setCommuneToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le prix pour cette commune ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le tarif spécifique pour cette commune sera supprimé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteCommune} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
