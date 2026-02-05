"use client";

import { useCallback, useState } from "react";

import {
  Bell,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import {
  Alert,
  AlertDescription,
} from "~/components/ui/alert";
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
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

type ZoneRow = {
  id: string;
  name: string;
  amountCents: number;
  communeNames: string[];
  updatedAt: Date;
};

type CommuneRow = {
  id: string;
  communeName: string;
  amountCents: number;
  updatedAt: Date;
};

const emptyZoneForm = { name: "", amountCents: 0, communeNamesText: "" };
const emptyCommuneForm = { communeName: "", amountCents: 0 };

export function DeliveryFeesContent() {
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [communeError, setCommuneError] = useState<string | null>(null);
  const [openZoneModal, setOpenZoneModal] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState(emptyZoneForm);
  const [zoneToDelete, setZoneToDelete] = useState<string | null>(null);
  const [openCommuneModal, setOpenCommuneModal] = useState(false);
  const [editingCommuneName, setEditingCommuneName] = useState<string | null>(null);
  const [communeForm, setCommuneForm] = useState(emptyCommuneForm);
  const [communeToDelete, setCommuneToDelete] = useState<string | null>(null);

  const utils = api.useUtils();
  const { data: zones = [], isLoading: zonesLoading } = api.delivery.getDeliveryZones.useQuery();
  const { data: communes = [], isLoading: communesLoading } =
    api.delivery.getDeliveryFeeCommunes.useQuery();

  const upsertZone = api.delivery.upsertDeliveryZone.useMutation({
    onSuccess: () => {
      setZoneError(null);
      setOpenZoneModal(false);
      setEditingZoneId(null);
      setZoneForm(emptyZoneForm);
      void utils.delivery.getDeliveryZones.invalidate();
    },
    onError: (e) => setZoneError(e.message),
  });
  const deleteZone = api.delivery.deleteDeliveryZone.useMutation({
    onSuccess: () => {
      setZoneToDelete(null);
      void utils.delivery.getDeliveryZones.invalidate();
    },
    onError: (e) => setZoneError(e.message),
  });

  const upsertCommune = api.delivery.upsertDeliveryFeeCommune.useMutation({
    onSuccess: () => {
      setCommuneError(null);
      setOpenCommuneModal(false);
      setEditingCommuneName(null);
      setCommuneForm(emptyCommuneForm);
      void utils.delivery.getDeliveryFeeCommunes.invalidate();
    },
    onError: (e) => setCommuneError(e.message),
  });
  const deleteCommune = api.delivery.deleteDeliveryFeeCommune.useMutation({
    onSuccess: () => {
      setCommuneToDelete(null);
      void utils.delivery.getDeliveryFeeCommunes.invalidate();
    },
    onError: (e) => setCommuneError(e.message),
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
      amountCents: z.amountCents,
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
      amountCents: zoneForm.amountCents,
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
      amountCents: c.amountCents,
    });
    setOpenCommuneModal(true);
  }, []);

  const saveCommune = useCallback(() => {
    upsertCommune.mutate({
      communeName: communeForm.communeName.trim(),
      amountCents: communeForm.amountCents,
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
      <DashboardHeader
        right={
          <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
            <Bell className="size-5" />
          </Button>
        }
      />
      <div className="flex-1 space-y-8 overflow-y-auto p-6 md:p-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Frais de livraison
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Zones (ex. Abidjan, Intérieur du pays) et communes par nom — sans code, adapté à la Côte d&apos;Ivoire.
          </p>
        </div>

        {/* Par zone */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <h3 className="text-lg font-semibold">Par zone</h3>
              <CardDescription>Un prix pour un groupe de communes (ex. Abidjan, Intérieur du pays).</CardDescription>
            </div>
            <Button onClick={openAddZone} className="gap-2" size="default">
              <Plus className="size-4" />
              Ajouter une zone
            </Button>
          </CardHeader>
          <CardContent>
            {zoneError && (
              <Alert variant="destructive" className="mb-4 flex flex-row flex-wrap items-center justify-between gap-2">
                <AlertDescription className="flex flex-1 items-center justify-between gap-2">
                  <span>{zoneError}</span>
                  <Button variant="ghost" size="sm" className="h-auto p-1" onClick={() => setZoneError(null)}>
                    Fermer
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {zonesLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : zones.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune zone. Ajoutez une zone (ex. Abidjan) et listez les noms des communes.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zone</TableHead>
                    <TableHead>Prix (€)</TableHead>
                    <TableHead>Communes</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zones.map((z) => (
                    <TableRow key={z.id}>
                      <TableCell className="font-medium">{z.name}</TableCell>
                      <TableCell>{(z.amountCents / 100).toFixed(2)} €</TableCell>
                      <TableCell className="text-muted-foreground">
                        {z.communeNames.length} commune{z.communeNames.length > 1 ? "s" : ""}
                        {z.communeNames.length <= 5
                          ? ` (${z.communeNames.join(", ")})`
                          : ` (${z.communeNames.slice(0, 3).join(", ")}…)`}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditZone(z)} aria-label="Modifier">
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Par commune */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <h3 className="text-lg font-semibold">Par commune</h3>
              <CardDescription>Prix pour une commune précise (nom, ex. Cocody, Bouaké).</CardDescription>
            </div>
            <Button onClick={openAddCommune} className="gap-2" size="default">
              <Plus className="size-4" />
              Ajouter une commune
            </Button>
          </CardHeader>
          <CardContent>
            {communeError && (
              <Alert variant="destructive" className="mb-4 flex flex-row flex-wrap items-center justify-between gap-2">
                <AlertDescription className="flex flex-1 items-center justify-between gap-2">
                  <span>{communeError}</span>
                  <Button variant="ghost" size="sm" className="h-auto p-1" onClick={() => setCommuneError(null)}>
                    Fermer
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {communesLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : communes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun prix par commune.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Commune</TableHead>
                    <TableHead>Prix (€)</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {communes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.communeName}</TableCell>
                      <TableCell>{(c.amountCents / 100).toFixed(2)} €</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditCommune(c)} aria-label="Modifier">
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingZoneId ? "Modifier la zone" : "Nouvelle zone"}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Nom de la zone (ex. Abidjan, Intérieur du pays), prix en euros, et noms des communes (un par ligne ou séparés par une virgule).
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
                <Label htmlFor="zone-amount">Prix (€)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                  <Input
                    id="zone-amount"
                    type="text"
                    inputMode="decimal"
                    className="pl-8"
                    placeholder="0.00"
                    value={zoneForm.amountCents === 0 ? "" : (zoneForm.amountCents / 100).toFixed(2)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      const num = parseFloat(v);
                      setZoneForm((f) => ({
                        ...f,
                        amountCents: Number.isNaN(num) ? 0 : Math.round(num * 100),
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="zone-communes">Noms des communes (un par ligne ou séparés par virgule)</Label>
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
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCommuneName ? "Modifier la commune" : "Nouvelle commune"}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Nom de la commune (ex. Cocody, Bouaké) et prix en euros.
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
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="commune-amount">Prix (€)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                  <Input
                    id="commune-amount"
                    type="text"
                    inputMode="decimal"
                    className="pl-8"
                    placeholder="0.00"
                    value={communeForm.amountCents === 0 ? "" : (communeForm.amountCents / 100).toFixed(2)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      const num = parseFloat(v);
                      setCommuneForm((f) => ({
                        ...f,
                        amountCents: Number.isNaN(num) ? 0 : Math.round(num * 100),
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
