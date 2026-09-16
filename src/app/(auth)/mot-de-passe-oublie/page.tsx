"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatErrorText } from "~/lib/copy";
import { marketing } from "~/lib/copy/marketing";
import { requestPasswordResetInputSchema } from "~/lib/validations/password-reset";
import { api } from "~/trpc/react";

const inputClassName =
  "w-full rounded-lg border border-border bg-card text-foreground h-12 px-4 focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-md focus:shadow-primary/10 transition-all duration-200 placeholder:text-placeholder";

const SUPPORT_MAILTO =
  "mailto:nyf.dev@gmail.com?subject=Acc%C3%A8s%20au%20compte%20SnapSell";

function SupportFallback() {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
      <p>
        La réinitialisation par email n’est pas disponible pour le moment. Contactez
        l’assistance pour retrouver l’accès à votre compte : elle vous enverra un lien
        de réinitialisation.
      </p>
      <p>
        Indiquez le nom de votre boutique et l’adresse email du compte. Ne communiquez
        jamais votre mot de passe.
      </p>
      <a
        className="inline-flex min-h-11 items-center font-semibold text-primary underline"
        href={SUPPORT_MAILTO}
      >
        Contacter l’assistance par email
      </a>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const availability = api.auth.passwordResetAvailability.useQuery();
  const request = api.auth.requestPasswordReset.useMutation({
    onSuccess: (_result, variables) => setSubmittedEmail(variables.email),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = requestPasswordResetInputSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.flatten().fieldErrors.email?.[0] ?? "Email invalide");
      return;
    }
    setFieldError(null);
    request.mutate(parsed.data);
  };

  return (
    <div className="flex w-full max-w-[480px] flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">
          Indiquez l’adresse email de votre compte. Si un compte existe, vous recevrez
          un lien pour choisir un nouveau mot de passe.
        </p>
      </div>

      {availability.isLoading ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Chargement…
        </p>
      ) : availability.data?.emailEnabled === false ? (
        <SupportFallback />
      ) : submittedEmail ? (
        <div
          className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm"
          role="status"
        >
          <p>
            Si un compte existe pour <strong>{submittedEmail}</strong>, vous recevrez
            un email. Le lien reste valable 30 minutes après sa génération.
          </p>
          <p>Pensez à vérifier vos courriers indésirables.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          {request.error && (
            <p
              className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {formatErrorText(request.error)}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forgot-email" className="text-sm font-semibold text-foreground">
              Adresse email
            </Label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="username"
              placeholder={marketing.placeholder.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClassName}
              required
              aria-invalid={!!fieldError}
            />
            {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
          </div>
          <Button
            type="submit"
            className="h-12 w-full rounded-lg text-base font-bold"
            disabled={request.isPending}
          >
            {request.isPending ? "Envoi…" : "Envoyer le lien"}
          </Button>
        </form>
      )}

      <Link
        href="/login"
        className="inline-flex min-h-11 items-center self-start text-sm text-primary underline-offset-4 hover:underline"
      >
        Retour à la connexion
      </Link>
    </div>
  );
}
