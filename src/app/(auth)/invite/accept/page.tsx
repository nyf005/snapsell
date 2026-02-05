"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { signIn } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";

const inputClassName =
  "w-full rounded-lg border border-slate-300 dark:border-[#314d68] bg-white dark:bg-[#182634] text-slate-900 dark:text-white h-14 px-4 focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-slate-400 dark:placeholder:text-[#90adcb]";

function InviteAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  // Note: isExistingAccount retiré car le serveur gère automatiquement ce cas
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: invitation, isLoading: loadingInvitation, error: invitationError } =
    api.invitations.getInvitationByToken.useQuery({ token }, { enabled: !!token });

  const acceptInvitation = api.invitations.acceptInvitation.useMutation({
    onSuccess: async (result, variables) => {
      setError(null);
      const email = invitation?.email;
      if (!email || !variables.password) {
        setError("Erreur: email ou mot de passe manquant. Redirection vers la connexion…");
        setTimeout(() => {
          router.push("/login?callbackUrl=/dashboard&fromInvite=1&message=account_created");
        }, 2000);
        return;
      }
      
      // Retry logic pour création de session (amélioration robustesse)
      let retries = 3;
      let lastError: string | null = null;
      
      while (retries > 0) {
        const res = await signIn("credentials", {
          email,
          password: variables.password,
          callbackUrl: "/dashboard",
          redirect: false,
        });
        
        if (res?.ok) {
          router.push("/dashboard");
          router.refresh();
          return;
        }
        
        lastError = res?.error ?? "Erreur de connexion";
        retries--;
        
        // Attendre 1 seconde avant retry (sauf dernier essai)
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Si échec après retries, rediriger vers login avec message
      setError(
        result.message ??
          "Compte créé avec succès, mais la connexion automatique a échoué. Veuillez vous connecter manuellement."
      );
      setTimeout(() => {
        router.push("/login?callbackUrl=/dashboard&fromInvite=1&message=signin_failed&email=" + encodeURIComponent(email));
      }, 3000);
    },
    onError: (e) => {
      const errorCode = e.data?.code as string | undefined;
      if (errorCode === "CONFLICT") {
        // Gestion améliorée : message clair avec bouton pour se connecter
        const conflictMessage = e.message ?? "Un compte existe déjà avec cet email.";
        setError(conflictMessage);
        // Redirection automatique après 3 secondes avec message explicite
        setTimeout(() => {
          router.push("/login?callbackUrl=/dashboard&fromInvite=1&message=already_member&error=" + encodeURIComponent(conflictMessage));
        }, 3000);
      } else if (errorCode === "GONE") {
        setError(
          "Cette invitation a déjà été utilisée ou a expiré. Demandez un nouveau lien à votre responsable."
        );
      } else {
        setError(e.message ?? "Erreur lors de l'acceptation. Veuillez réessayer.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Lien d'invitation invalide.");
      return;
    }
    // Note: Le cas "existing account" n'est plus géré ici car le serveur refuse
    // l'invitation si l'utilisateur existe déjà (CONFLICT)
    const nameTrimmed = name.trim();
    if (!nameTrimmed) {
      setError("Le nom est requis.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    acceptInvitation.mutate({ token, name: nameTrimmed, password });
  };

  // États d'erreur / chargement — même structure visuelle que signup
  if (!token) {
    return (
      <div className="max-w-[480px] w-full flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Lien d'invitation invalide
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Ce lien est incorrect ou expiré. Demandez un nouveau lien à votre responsable.
          </p>
        </div>
        <Button asChild className="h-14 rounded-lg text-lg font-bold shadow-lg shadow-primary/20">
          <Link href="/login">Aller à la connexion</Link>
        </Button>
      </div>
    );
  }

  if (loadingInvitation) {
    return (
      <div className="max-w-[480px] w-full flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Chargement…
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Vérification de votre invitation en cours.
          </p>
        </div>
      </div>
    );
  }

  if (invitationError ?? !invitation) {
    return (
      <div className="max-w-[480px] w-full flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Invitation introuvable ou expirée
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Ce lien a déjà été utilisé ou a expiré. Demandez un nouveau lien à votre responsable.
          </p>
        </div>
        <Button asChild className="h-14 rounded-lg text-lg font-bold shadow-lg shadow-primary/20">
          <Link href="/login">Aller à la connexion</Link>
        </Button>
      </div>
    );
  }

  // Formulaire principal — aligné sur la page signup
  return (
    <div className="max-w-[480px] w-full flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white md:text-4xl">
          Rejoindre l'équipe {invitation.tenantName}
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Vous avez été invité en tant qu'agent. Complétez votre inscription ci-dessous pour
          accéder au tableau de bord.
        </p>
      </div>

      {/* Note: Le toggle connexion/création compte a été retiré car le serveur gère
          automatiquement le cas utilisateur existant (refus avec CONFLICT) */}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <p
            className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="invite-email"
            className="text-sm font-semibold text-slate-900 dark:text-white"
          >
            Adresse email
          </Label>
          <Input
            id="invite-email"
            type="email"
            value={invitation.email}
            readOnly
            className={inputClassName + " bg-muted/50 cursor-not-allowed"}
            aria-describedby="invite-email-desc"
          />
          <p id="invite-email-desc" className="text-xs text-slate-500 dark:text-slate-400">
            Email associé à votre invitation (non modifiable).
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="invite-name"
            className="text-sm font-semibold text-slate-900 dark:text-white"
          >
            Votre nom
          </Label>
          <Input
            id="invite-name"
            type="text"
            placeholder="Jean Dupont"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClassName}
            required
            disabled={acceptInvitation.isPending}
            aria-invalid={!!error}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="invite-password"
            className="text-sm font-semibold text-slate-900 dark:text-white"
          >
            Mot de passe
          </Label>
          <div className="relative">
            <Input
              id="invite-password"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 caractères"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClassName}
              required
              minLength={8}
              disabled={acceptInvitation.isPending}
              aria-invalid={!!error}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 size-9"
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </Button>
          </div>
        </div>

        <Button
          type="submit"
          className="h-14 w-full rounded-lg text-lg font-bold shadow-lg shadow-primary/20 hover:bg-primary/90"
          disabled={acceptInvitation.isPending}
        >
          {acceptInvitation.isPending ? "En cours…" : "Rejoindre l'équipe"}
        </Button>

        <p className="px-4 text-center text-xs text-slate-500 dark:text-slate-400">
          En rejoignant, vous acceptez nos{" "}
          <Link href="#" className="text-primary hover:underline">
            Conditions d&apos;utilisation
          </Link>{" "}
          et notre{" "}
          <Link href="#" className="text-primary hover:underline">
            Politique de confidentialité
          </Link>
          .
        </p>
      </form>

      <div className="flex items-center justify-center gap-2 pt-4 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Vous avez déjà un compte ?</span>
        <Link href="/login" className="font-bold text-primary hover:underline">
          Se connecter
        </Link>
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Chargement…</p>}>
      <InviteAcceptContent />
    </Suspense>
  );
}
