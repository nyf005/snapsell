"use client";

/**
 * Changement de mot de passe, depuis le pied de la barre latérale.
 *
 * Placé là, avec le nom du compte et la déconnexion, plutôt que dans
 * `/parametres` : cet écran est réservé aux rôles Propriétaire et Manager, or un
 * Agent a exactement les mêmes raisons de changer son mot de passe. Un réglage
 * qui concerne la personne n'a pas à hériter des droits qui concernent la
 * boutique.
 *
 * L'opération invalide toutes les sessions du compte, la courante comprise —
 * c'est ce qu'on attend d'un mot de passe qu'on remplace parce qu'il a fuité. On
 * enchaîne donc sur une déconnexion annoncée, plutôt que de laisser la personne
 * se faire éjecter sans explication dans l'heure qui suit.
 */

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Eye, EyeOff, KeyRound } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatErrorText } from "~/lib/copy";
import { changePasswordInputSchema } from "~/lib/validations/signup";
import { api } from "~/trpc/react";

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const changePassword = api.auth.changePassword.useMutation({
    onSuccess: () => {
      setError(null);
      setDone(true);
      // Laisse le temps de lire avant que l'écran ne bascule sur la connexion.
      setTimeout(() => {
        void signOut({ callbackUrl: "/login?message=password_changed" });
      }, 2500);
    },
    onError: (e) => setError(formatErrorText(e, "auth")),
  });

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setShowPasswords(false);
    setError(null);
    setDone(false);
  }

  function handleOpenChange(next: boolean) {
    // Pendant la déconnexion programmée, refermer laisserait un écran incohérent.
    if (done) return;
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Même schéma que le serveur : la personne voit l'erreur sans aller-retour.
    const parsed = changePasswordInputSchema.safeParse({
      currentPassword,
      newPassword,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Vérifiez les champs saisis.",
      );
      return;
    }

    changePassword.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Changer mon mot de passe"
          className="shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <KeyRound className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Changer mon mot de passe</DialogTitle>
          <DialogDescription>
            Vous serez déconnecté de tous vos appareils, celui-ci compris.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <p
            className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm"
            role="status"
          >
            Mot de passe modifié. Reconnexion en cours…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <p
                className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="current-password">Mot de passe actuel</Label>
              <Input
                id="current-password"
                type={showPasswords ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={changePassword.isPending}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Min. 8 caractères"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={changePassword.isPending}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-1 top-1/2 size-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={
                    showPasswords
                      ? "Masquer les mots de passe"
                      : "Afficher les mots de passe"
                  }
                >
                  {showPasswords ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleOpenChange(false)}
                disabled={changePassword.isPending}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? "En cours…" : "Changer"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
