"use client";

import { useMemo, useState } from "react";

import { MoreVertical, Search, UserPlus, Users } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import { api } from "~/trpc/react";
import { formatErrorText } from "~/lib/copy";
import { DataList } from "~/components/ui/data-list";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { KpiCard } from "~/components/ui/kpi-card";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { TeamContentSkeleton } from "./team-content-skeletons";
import { Label } from "~/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Info } from "lucide-react";

import { z } from "zod";

const emailSchema = z.string().email("Adresse email invalide");
function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value.trim()).success;
}

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
    if (name.length >= 2) return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

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

function formatRole(role: string): string {
  if (role === "OWNER") return "Admin";
  if (role === "MANAGER") return "Manager";
  if (role === "AGENT") return "Agent";
  return role;
}

function MemberAvatar({ initials, isPrimary }: { initials: string; isPrimary?: boolean }) {
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

type RoleOption = "MANAGER" | "AGENT";

export function TeamContent() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);

  // Dialog: modifier le rôle
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<{ id: string; name: string; currentRole: RoleOption } | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleOption>("AGENT");

  // Dialog : retirer de l'équipe
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const utils = api.useUtils();

  const createInvitation = api.invitations.createInvitation.useMutation({
    onSuccess: (data) => {
      setCreatedInviteLink(data.acceptLink);
      void utils.invitations.listInvitations.invalidate();
      void utils.team.listMembers.invalidate();
    },
    onError: (e) => {
      setInviteEmailError(formatErrorText(e, "team"));
    },
  });

  const updateRole = api.team.updateRole.useMutation({
    onSuccess: () => {
      setRoleDialogOpen(false);
      setRoleTarget(null);
      void utils.team.listMembers.invalidate();
    },
  });

  const removeMember = api.team.removeMember.useMutation({
    onSuccess: () => {
      setRemoveDialogOpen(false);
      setRemoveTarget(null);
      void utils.team.listMembers.invalidate();
    },
  });

  const { data: members = [], isLoading: loadingMembers } = api.team.listMembers.useQuery();
  const { data: invitations = [], isLoading: loadingInvitations } = api.invitations.listInvitations.useQuery();

  const allMembers = useMemo(() => {
    const activeMembers = members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      initials: getInitials(m.name, m.email),
      role: formatRole(m.role),
      rawRole: m.role,
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
      rawRole: inv.role,
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
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [search, allMembers]);

  const stats = useMemo(() => {
    const total = allMembers.length;
    const activeAgents = allMembers.filter(
      (m) => m.role === "Agent" && m.status === "Active",
    ).length;
    const pendingInvites = allMembers.filter((m) => m.status === "Pending").length;
    return { total, activeAgents, pendingInvites };
  }, [allMembers]);

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteEmailError(null);
    setCreatedInviteLink(null);
    const email = inviteEmail.trim();
    if (!email) { setInviteEmailError("L'adresse email est requise."); return; }
    if (!isValidEmail(email)) { setInviteEmailError("Adresse email invalide."); return; }
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

  const openRoleDialog = (member: { id: string; name: string; rawRole: string }) => {
    const currentRole = (member.rawRole === "MANAGER" ? "MANAGER" : "AGENT") as RoleOption;
    setRoleTarget({ id: member.id, name: member.name, currentRole });
    setSelectedRole(currentRole);
    setRoleDialogOpen(true);
  };

  const openRemoveDialog = (member: { id: string; name: string }) => {
    setRemoveTarget({ id: member.id, name: member.name });
    setRemoveDialogOpen(true);
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
              aria-label="Rechercher un membre de l'équipe"
            />
          </span>
        }
      />
      <main className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-4 md:p-8">
        <TaskPageHeader
          href="/parametres/team"
          actions={
            <Button
              className="w-full shrink-0 gap-2 font-semibold sm:w-auto"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="size-4" />
              Inviter un agent
            </Button>
          }
        />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Total membres" value={stats.total} icon={Users} iconVariant="primary" />
          <KpiCard label="Agents actifs" value={stats.activeAgents} icon={Users} iconVariant="success" />
          <KpiCard
            label="Invitations en attente"
            value={stats.pendingInvites}
            icon={UserPlus}
            iconVariant="warning"
            valueClassName="text-xl font-bold tabular-nums md:text-2xl text-primary"
          />
        </section>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-semibold">Tous les membres</h3>
        </div>

        <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
          {loadingMembers || loadingInvitations ? (
            <div className="p-6"><TeamContentSkeleton /></div>
          ) : (
            <>
              <DataList
                items={filteredMembers}
                getKey={(m) => m.id}
                label="Membres de l’équipe"
                columns={[
                  {
                    id: "member",
                    header: "Membre",
                    role: "primary",
                    headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    className: "whitespace-nowrap px-6 py-4",
                    cell: (member) => (
                      <span className="flex items-center gap-3">
                        <MemberAvatar
                          initials={member.initials}
                          isPrimary={member.role === "Admin" || member.role === "Manager"}
                        />
                        <span>
                          <p className="text-sm font-medium">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </span>
                      </span>
                    ),
                  },
                  {
                    id: "role",
                    header: "Rôle",
                    role: "meta",
                    headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    className: "whitespace-nowrap px-6 py-4",
                    cell: (member) => (
                      <Badge
                        variant={
                          member.role === "Admin" || member.role === "Manager"
                            ? "default"
                            : "secondary"
                        }
                        className={
                          member.role === "Admin"
                            ? "border-purple-200 bg-purple-100 text-purple-600 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                            : ""
                        }
                      >
                        {member.role}
                      </Badge>
                    ),
                  },
                  {
                    id: "status",
                    header: "Statut",
                    role: "meta",
                    headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    className: "whitespace-nowrap px-6 py-4",
                    cell: (member) => <StatusCell status={member.status} />,
                  },
                  {
                    id: "lastActive",
                    header: "Dernière activité",
                    role: "hiddenOnMobile",
                    headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    className: "whitespace-nowrap px-6 py-4 text-sm text-muted-foreground",
                    cell: (member) => member.lastActive,
                  },
                ]}
                actions={(member) => {
                  const isOwner = member.rawRole === "OWNER";
                  const canAct = !isOwner && !member.isPending;
                  if (member.isPending) {
                    return (
                      <Button
                        variant="link"
                        size="xs"
                        className="h-auto p-0 font-bold text-primary hover:underline"
                      >
                        Renvoyer l’invitation
                      </Button>
                    );
                  }
                  if (!canAct) return null;
                  return (
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
                        <DropdownMenuItem onSelect={() => openRoleDialog(member)}>
                          Modifier le rôle
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => openRemoveDialog(member)}
                        >
                          Retirer de l’équipe
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }}
                empty={
                  <Empty className="mx-auto max-w-sm border-0 p-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon" className="size-14 rounded-2xl [&_svg]:size-7">
                        <Users />
                      </EmptyMedia>
                      <EmptyTitle>Aucun membre trouvé</EmptyTitle>
                      <EmptyDescription>
                        {search.trim()
                          ? "Aucun membre ne correspond à votre recherche."
                          : "Invitez des agents pour qu’ils apparaissent ici."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                }
              />
              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
                <p className="text-xs text-muted-foreground">
                  {filteredMembers.length} sur {stats.total} membres
                </p>
                <span className="flex gap-2">
                  <Button variant="outline" size="xs" disabled>Précédent</Button>
                  <Button variant="outline" size="xs" disabled>Suivant</Button>
                </span>
              </div>
            </>
          )}
        </Card>
      </main>

      {/* Dialog: inviter un membre */}
      <Dialog open={inviteOpen} onOpenChange={closeInviteModal}>
        <DialogContent variant="sheet-on-mobile" className="max-w-md border-border" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {createdInviteLink ? "Lien d'invitation créé" : "Inviter un membre"}
            </DialogTitle>
          </DialogHeader>
          {createdInviteLink ? (
            <div className="space-y-4 pt-0">
              <p className="text-sm text-muted-foreground">
                Envoyez ce lien à l'agent invité pour qu'il rejoigne votre équipe.
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
                <Button className="flex-1" onClick={() => closeInviteModal(false)}>Fermer</Button>
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
                <span id="invite-role-label" className="text-sm font-medium">Rôle attribué</span>
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
                  mais ne peuvent pas modifier la facturation ni supprimer la boutique.
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
                  {createInvitation.isPending ? "Création…" : "Envoyer l'invitation"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: modifier le rôle */}
      <Dialog open={roleDialogOpen} onOpenChange={(open) => { setRoleDialogOpen(open); if (!open) updateRole.reset(); }}>
        <DialogContent variant="sheet-on-mobile" className="max-w-sm border-border" showCloseButton>
          <DialogHeader>
            <DialogTitle>Modifier le rôle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Modifier le rôle de <span className="font-semibold text-foreground">{roleTarget?.name}</span>.
            </p>
            <div className="space-y-2">
              <Label htmlFor="role-select">Nouveau rôle</Label>
              <Select
                value={selectedRole}
                onValueChange={(v) => setSelectedRole(v as RoleOption)}
                disabled={updateRole.isPending}
              >
                <SelectTrigger id="role-select" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="AGENT">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {updateRole.error && (
              <p className="text-xs text-destructive" role="alert">{formatErrorText(updateRole.error, "team")}</p>
            )}
          </div>
          <DialogFooter className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setRoleDialogOpen(false)}
              disabled={updateRole.isPending}
            >
              Annuler
            </Button>
            <Button
              className="flex-1"
              disabled={updateRole.isPending || selectedRole === roleTarget?.currentRole}
              onClick={() => {
                if (!roleTarget) return;
                updateRole.mutate({ userId: roleTarget.id, role: selectedRole });
              }}
            >
              {updateRole.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmer le retrait */}
      <Dialog open={removeDialogOpen} onOpenChange={(open) => { setRemoveDialogOpen(open); if (!open) removeMember.reset(); }}>
        <DialogContent variant="sheet-on-mobile" className="max-w-sm border-border" showCloseButton>
          <DialogHeader>
            <DialogTitle>Retirer de l’équipe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Êtes-vous sûr de vouloir retirer{" "}
              <span className="font-semibold text-foreground">{removeTarget?.name}</span> de votre équipe ?
              Cette personne perdra immédiatement l’accès.
            </p>
            {removeMember.error && (
              <p className="text-xs text-destructive" role="alert">{formatErrorText(removeMember.error, "team")}</p>
            )}
          </div>
          <DialogFooter className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setRemoveDialogOpen(false)}
              disabled={removeMember.isPending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={removeMember.isPending}
              onClick={() => {
                if (!removeTarget) return;
                removeMember.mutate({ userId: removeTarget.id });
              }}
            >
              {removeMember.isPending ? "Retrait…" : "Retirer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
