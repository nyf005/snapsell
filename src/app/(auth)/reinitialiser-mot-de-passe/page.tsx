"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatErrorText } from "~/lib/copy";
import {
  FORGOT_PASSWORD_PATH,
  PASSWORD_RESET_TOKEN_PATTERN,
  getResetPasswordValidationErrors,
} from "~/lib/validations/password-reset";
import { api } from "~/trpc/react";

const inputClassName =
  "w-full rounded-lg border border-border bg-card text-foreground h-12 px-4 focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-md focus:shadow-primary/10 transition-all duration-200 placeholder:text-placeholder";

function InvalidLink() {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm" role="alert">
      <p>Ce lien de réinitialisation n’est pas valide ou est incomplet.</p>
      <Link
        href={FORGOT_PASSWORD_PATH}
        className="inline-flex min-h-11 items-center font-semibold text-primary underline"
      >
        Demander un nouveau lien
      </Link>
    </div>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = api.auth.resetPassword.useMutation({
    onSuccess: () => {
      router.push("/login?message=password_reset");
    },
  });

  if (!PASSWORD_RESET_TOKEN_PATTERN.test(token)) return <InvalidLink />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = getResetPasswordValidationErrors({ token, password, confirmation });
    if (err) {
      setErrors(err);
      return;
    }
    setErrors({});
    reset.mutate({ token, password });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      {reset.error && (
        <div
          className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <p>{formatErrorText(reset.error)}</p>
          <Link href={FORGOT_PASSWORD_PATH} className="inline-flex min-h-11 items-center font-semibold underline">
            Demander un nouveau lien
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-password" className="text-sm font-semibold text-foreground">
          Nouveau mot de passe
        </Label>
        <div className="relative">
          <Input
            id="reset-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Au moins 8 caractères"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClassName}
            required
            aria-invalid={!!errors.password}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-1 top-1/2 size-11 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </Button>
        </div>
        {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-confirmation" className="text-sm font-semibold text-foreground">
          Confirmez le mot de passe
        </Label>
        <Input
          id="reset-confirmation"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Saisissez-le une seconde fois"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className={inputClassName}
          required
          aria-invalid={!!errors.confirmation}
        />
        {errors.confirmation && (
          <p className="text-sm text-destructive">{errors.confirmation}</p>
        )}
      </div>
      <Button
        type="submit"
        className="h-12 w-full rounded-lg text-base font-bold"
        disabled={reset.isPending}
      >
        {reset.isPending ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex w-full max-w-[480px] flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Nouveau mot de passe</h1>
        <p className="text-sm text-muted-foreground">
          Choisissez un nouveau mot de passe. Les autres appareils connectés à ce compte
          devront se reconnecter.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <ResetPasswordContent />
      </Suspense>
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center self-start text-sm text-primary underline-offset-4 hover:underline"
      >
        Retour à la connexion
      </Link>
    </div>
  );
}
