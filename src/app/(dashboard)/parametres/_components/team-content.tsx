"use client";

import { useMemo, useState } from "react";

import { Bell, HelpCircle, Info, MoreVertical, Search, UserPlus } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { api } from "~/trpc/react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

/** Validation email côté client - utilise le même schéma Zod que le serveur */
import { z } from "zod";

const emailSchema = z.string().email("Adresse email invalide");
function isValidEmail(value: string): boolean {
  const result = emailSchema.safeParse(value.trim());
  return result.success;
}

/** Génère les initiales à partir d'un nom ou email */
function getInitials(name: string, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      if (first && last && first[0] && last[0]) {
        return (first[0] + last[0]).toUpperCase();
      }
    }
    if (name.length >= 2) {
      return name.slice(0, 2).toUpperCase();
    }
  }
  return email.slice(0, 2).toUpperCase();
}

/** Formate la date de dernière activité */
function formatLastActive(updatedAt: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - updatedAt.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min${diffMins > 1 ? "s" : ""}`;
  if (diffHours < 24) return `Il y a ${diffHours} heure${diffHours > 1 ? "s" : ""}`;
  if (diffDays < 7) return `Il y a ${diffDays} jour${diffDays > 1 ? "s" : ""}`;
  return updatedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Formate le rôle pour l'affichage */
function formatRole(role: string): string {
  if (role === "OWNER") return "Admin";
  if (role === "MANAGER") return "Manager";
  if (role === "AGENT") return "Agent";
  return role;
}

function MemberAvatar({
  initials,
  isPrimary,
}: {
  initials: string;
  isPrimary?: boolean;
}) {
  return (
    <span
      className={
        isPrimary
          ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
          : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground"
      }
      aria-hidden
    >
      {initials}
    </span>
  );
}

function StatusCell({ status }: { status: string }) {
  const dotClass =
    status === "Active"
      ? "bg-emerald-500"
      : status === "Pending"
        ? "bg-amber-500"
        : "bg-muted-foreground/50";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      <span className="text-sm">{status}</span>
    </span>
  );
}

export function TeamContent() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);

  const utils = api.useUtils();
  const createInvitation = api.invitations.createInvitation.useMutation({
    onSuccess: (data) => {
      setCreatedInviteLink(data.acceptLink);
      void utils.invitations.listInvitations.invalidate();
      void utils.team.listMembers.invalidate();
    },
    onError: (e) => {
      setInviteEmailError(e.message ?? "Erreur lors de la création de l’invitation.");
    },
  });

  const { data: members = [], isLoading: loadingMembers } = api.team.listMembers.useQuery();
  const { data: invitations = [], isLoading: loadingInvitations } = api.invitations.listInvitations.useQuery();

  // Combiner membres actifs et invitations en attente
  const allMembers = useMemo(() => {
    const activeMembers = members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      initials: getInitials(m.name, m.email),
      role: formatRole(m.role),
      status: "Active" as const,
      lastActive: formatLastActive(m.updatedAt),
      isPending: false,
    }));

    const pendingInvites = invitations.map((inv) => ({
      id: inv.id,
      name: inv.email.split("@")[0] ?? "Invité",
      email: inv.email,
      initials: getInitials(inv.email.split("@")[0] ?? "", inv.email),
      role: formatRole(inv.role),
      status: "Pending" as const,
      lastActive: "N/A",
      isPending: true,
    }));

    return [...activeMembers, ...pendingInvites];
  }, [members, invitations]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allMembers;
    return allMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [search, allMembers]);

  const stats = useMemo(() => {
    const total = allMembers.length;
    const activeAgents = allMembers.filter(
      (m) => m.role === "Agent" && m.status === "Active"
    ).length;
    const pendingInvites = allMembers.filter((m) => m.status === "Pending").length;
    return { total, activeAgents, pendingInvites };
  }, [allMembers]);

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteEmailError(null);
    setCreatedInviteLink(null);
    const email = inviteEmail.trim();
    if (!email) {
      setInviteEmailError("L’adresse email est requise.");
      return;
    }
    if (!isValidEmail(email)) {
      setInviteEmailError("Adresse email invalide.");
      return;
    }
    createInvitation.mutate({ email });
  };

  const closeInviteModal = (open: boolean) => {
    setInviteOpen(open);
    if (!open) {
      setInviteEmailError(null);
      setInviteEmail("");
      setCreatedInviteLink(null);
    }
  };

  const copyInviteLink = () => {
    if (!createdInviteLink) return;
    const url = typeof window !== "undefined" ? `${window.location.origin}${createdInviteLink}` : createdInviteLink;
    void navigator.clipboard.writeText(url);
  };

  return (
    <>
      <DashboardHeader
        left={
          <span className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Rechercher un membre..."
              className="h-9 w-full pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Rechercher un membre de l’équipe"
            />
          </span>
        }
        right={
          <>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Aide">
              <HelpCircle className="size-5" />
            </Button>
          </>
        }
      />
      <main className="flex-1 space-y-8 overflow-y-auto p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <header>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
              Gestion d’équipe
            </h1>
            <p className="mt-1 text-muted-foreground">
              Contrôlez qui a accès à votre boutique et ce qu’ils peuvent faire.
            </p>
          </header>
          <Button
            size="sm"
            className="shrink-0 gap-2 font-semibold shadow-sm"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="size-4" />
            Inviter un agent
          </Button>
        </div>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="gap-0 py-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total membres
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-0">
              <p className="text-3xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="gap-0 py-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Agents actifs
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-0">
              <p className="text-3xl font-bold">{stats.activeAgents}</p>
            </CardContent>
          </Card>
          <Card className="gap-0 py-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Invitations en attente
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-0">
              <p className="text-3xl font-bold text-primary">{stats.pendingInvites}</p>
            </CardContent>
          </Card>
        </section>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-semibold">Tous les membres</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="xs"
              title="Disponible avec les données serveur"
              disabled
            >
              Filtre
            </Button>
            <Button
              variant="outline"
              size="xs"
              title="Disponible avec les données serveur"
              disabled
            >
              Exporter
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-border gap-0 pb-0 pt-0 shadow-sm rounded-2xl">
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-muted/60 hover:bg-muted/60">
                <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Membre
                </TableHead>
                <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Rôle
                </TableHead>
                <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Statut
                </TableHead>
                <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Dernière activité
                </TableHead>
                <TableHead className="w-12 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingMembers || loadingInvitations ? (
                <TableRow>
                  <TableCell colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Chargement des membres...
                  </TableCell>
                </TableRow>
              ) : filteredMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Aucun membre trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredMembers.map((member, idx) => (
                <TableRow
                  key={member.id}
                  className={cn(
                    "border-border transition-colors hover:bg-muted/40",
                    idx % 2 === 1 && "bg-muted/20"
                  )}
                >
                  <TableCell className="whitespace-nowrap px-6 py-4">
                    <span className="flex items-center gap-3">
                      <MemberAvatar
                        initials={member.initials}
                        isPrimary={member.role === "Admin" || member.role === "Manager"}
                      />
                      <span>
                        <p className="text-sm font-medium">
                          {member.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-6 py-4">
                    <Badge
                      variant={member.role === "Admin" || member.role === "Manager" ? "default" : "secondary"}
                      className={
                        member.role === "Admin"
                          ? "border-purple-200 bg-purple-100 text-purple-600 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                          : ""
                      }
                    >
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-6 py-4">
                    <StatusCell status={member.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                    {member.lastActive}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-6 py-4 text-right">
                    {member.isPending ? (
                      <Button
                        variant="link"
                        size="xs"
                        className="h-auto p-0 font-bold text-primary hover:underline"
                      >
                        Renvoyer l’invitation
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            aria-label="Actions"
                          >
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              // TODO: Implémenter modification de rôle (nécessite router team.updateRole)
                              alert("Fonctionnalité à venir : modification de rôle");
                            }}
                            disabled
                            title="Modification de rôle (à implémenter)"
                          >
                            Modifier le rôle
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => {
                              // TODO: Implémenter retrait du tenant (nécessite router team.removeMember)
                              alert("Fonctionnalité à venir : retrait du tenant");
                            }}
                            disabled
                            title="Retrait du tenant (à implémenter)"
                          >
                            Retirer du tenant
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
            <p className="text-xs text-muted-foreground">
              {filteredMembers.length} sur {stats.total} membres
            </p>
            <span className="flex gap-2" aria-label="Pagination (sera activée avec les données serveur)">
              <Button variant="outline" size="xs" disabled title="Pagination avec données serveur">
                Précédent
              </Button>
              <Button variant="outline" size="xs" disabled title="Pagination avec données serveur">
                Suivant
              </Button>
            </span>
          </div>
        </Card>
      </main>

      <Dialog
        open={inviteOpen}
        onOpenChange={closeInviteModal}
      >
        <DialogContent className="max-w-md border-border" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {createdInviteLink ? "Lien d’invitation créé" : "Inviter un membre"}
            </DialogTitle>
          </DialogHeader>
          {createdInviteLink ? (
            <div className="space-y-4 pt-0">
              <p className="text-sm text-muted-foreground">
                Envoyez ce lien à l’agent invité pour qu’il rejoigne votre équipe.
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={typeof window !== "undefined" ? `${window.location.origin}${createdInviteLink}` : createdInviteLink}
                  className="h-9 font-mono text-xs"
                />
                <Button type="button" variant="secondary" size="sm" onClick={copyInviteLink}>
                  Copier
                </Button>
              </div>
              <DialogFooter className="flex gap-3 pt-2">
                <Button className="flex-1" onClick={() => closeInviteModal(false)}>
                  Fermer
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleInviteSubmit} className="space-y-5 pt-0">
              <fieldset className="space-y-2">
                <Label htmlFor="invite-email">Adresse email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="exemple@email.com"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    if (inviteEmailError) setInviteEmailError(null);
                  }}
                  className="h-9"
                  disabled={createInvitation.isPending}
                  aria-invalid={!!inviteEmailError}
                  aria-describedby={inviteEmailError ? "invite-email-error" : undefined}
                />
                {inviteEmailError && (
                  <p id="invite-email-error" className="text-xs text-destructive" role="alert">
                    {inviteEmailError}
                  </p>
                )}
              </fieldset>
              <fieldset className="space-y-2" aria-labelledby="invite-role-label">
                <span id="invite-role-label" className="text-sm font-medium">
                  Rôle attribué
                </span>
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-primary bg-primary/5 p-4">
                  <UserPlus className="mb-2 size-6 text-primary" aria-hidden />
                  <span className="text-sm font-bold text-primary">Agent</span>
                  <span className="text-center text-[10px] text-muted-foreground">
                    Accès support standard (scope story 1-7)
                  </span>
                </div>
              </fieldset>
              <Alert variant="default" className="rounded-lg bg-muted py-4">
                <Info className="size-5 text-muted-foreground" />
                <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                  Les agents peuvent gérer les annonces et discuter avec les clients,
                  mais ne peuvent pas modifier la facturation ni supprimer la
                  boutique.
                </AlertDescription>
              </Alert>
              <DialogFooter className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setInviteOpen(false)}
                  disabled={createInvitation.isPending}
                >
                  Annuler
                </Button>
                <Button type="submit" className="flex-1 shadow-md" disabled={createInvitation.isPending}>
                  {createInvitation.isPending ? "Création…" : "Envoyer l’invitation"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
