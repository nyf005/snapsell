"use client";

import { useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatErrorText } from "~/lib/copy";
import { requestPasswordResetInputSchema } from "~/lib/validations/password-reset";
import { api } from "~/trpc/react";

export function OpsAccountsContent() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createLink = api.ops.accounts.createPasswordResetLink.useMutation({
    onSuccess: () => setCopied(false),
  });

  const absoluteLink = createLink.data
    ? `${typeof window === "undefined" ? "" : window.location.origin}${createLink.data.path}`
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = requestPasswordResetInputSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.flatten().fieldErrors.email?.[0] ?? "Email invalide");
      return;
    }
    setFieldError(null);
    createLink.mutate(parsed.data);
  };

  const copy = async () => {
    if (!absoluteLink) return;
    try {
      await navigator.clipboard.writeText(absoluteLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <KeyRound className="size-6" aria-hidden />
          Accès aux comptes
        </h1>
        <p className="text-sm text-muted-foreground">
          Générez un lien de réinitialisation pour une boutique qui a perdu son mot de
          passe, puis transmettez-le par le canal où la personne vous a écrit. Le lien
          est valable 30 minutes et ne sert qu’une fois.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ops-reset-email">Adresse email du compte</Label>
              <Input
                id="ops-reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="boutique@exemple.com"
                aria-invalid={!!fieldError}
              />
              {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
            </div>
            {createLink.error && (
              <p
                className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {formatErrorText(createLink.error)}
              </p>
            )}
            <Button type="submit" disabled={createLink.isPending} className="self-start">
              {createLink.isPending ? "Génération…" : "Générer un lien"}
            </Button>
          </form>

          {createLink.data && absoluteLink && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4" role="status">
              <p className="text-sm">
                Lien pour <strong>{createLink.data.email}</strong>, valable jusqu’à{" "}
                {new Date(createLink.data.expiresAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                .
              </p>
              <code className="break-all rounded bg-background px-2 py-1 text-xs">{absoluteLink}</code>
              <Button type="button" variant="outline" size="sm" onClick={copy} className="self-start">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copié" : "Copier le lien"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
