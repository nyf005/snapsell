"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo, useEffect } from "react";

import { signIn } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";


import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { getLoginValidationErrors } from "~/lib/validations/login";
import { getSignupValidationErrors } from "~/lib/validations/signup";
import { api } from "~/trpc/react";

const inputClassName =
  "w-full rounded-lg border border-border bg-card text-foreground h-14 px-4 focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-md focus:shadow-primary/10 transition-all duration-200 placeholder:text-placeholder";

type Tab = "login" | "signup";

function LoginTabContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl") ?? "/dashboard";
  const callbackUrl =
    typeof rawCallback === "string" &&
    rawCallback.startsWith("/") &&
    !rawCallback.startsWith("//")
      ? rawCallback
      : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = getLoginValidationErrors({ email, password });
    if (err) {
      setErrors(err);
      return;
    }
    setErrors({});
    setIsPending(true);

    const res = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });

    setIsPending(false);
    if (res?.ok) {
      router.push(callbackUrl);
      router.refresh();
    } else {
      setErrors({
        form: "Identifiants invalides. Vérifiez votre email et mot de passe.",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {errors.form && (
        <p
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {errors.form}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="login-email"
          className="text-sm font-semibold text-foreground"
        >
          Adresse email
        </Label>
        <Input
          id="login-email"
          type="email"
          placeholder="vous@entreprise.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClassName}
          required
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="login-password"
          className="text-sm font-semibold text-foreground"
        >
          Mot de passe
        </Label>
        <div className="relative">
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            placeholder="Saisissez votre mot de passe"
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
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground size-9"
            aria-label={
              showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
            }
          >
            {showPassword ? (
              <EyeOff className="size-5" />
            ) : (
              <Eye className="size-5" />
            )}
          </Button>
        </div>
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password}</p>
        )}
      </div>
      <Button
        type="submit"
        className="h-14 w-full rounded-lg text-lg font-bold shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
        disabled={isPending}
      >
        {isPending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}

function SignupTabContent() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const signup = api.auth.signup.useMutation({
    onSuccess: async () => {
      const res = await signIn("credentials", {
        email,
        password,
        callbackUrl: "/dashboard",
        redirect: false,
      });
      if (res?.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setErrors({
          form: "Compte créé mais connexion échouée. Essayez de vous connecter.",
        });
      }
    },
    onError: (e) => {
      setErrors({ form: e.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = getSignupValidationErrors({
      email,
      password,
      tenantName,
      name: name || undefined,
    });
    if (err) {
      setErrors(err);
      return;
    }
    setErrors({});
    signup.mutate({ email, password, tenantName, name: name || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {errors.form && (
        <p
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {errors.form}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="signup-tenantName"
          className="text-sm font-semibold text-foreground"
        >
          Nom de la boutique
        </Label>
        <Input
          id="signup-tenantName"
          type="text"
          placeholder="ex. Ma boutique"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          className={inputClassName}
          required
          aria-invalid={!!errors.tenantName}
        />
        {errors.tenantName && (
          <p className="text-sm text-destructive">{errors.tenantName}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="signup-email"
          className="text-sm font-semibold text-foreground"
        >
          Adresse email
        </Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="vous@entreprise.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClassName}
          required
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="signup-password"
          className="text-sm font-semibold text-foreground"
        >
          Mot de passe
        </Label>
        <div className="relative">
          <Input
            id="signup-password"
            type={showPassword ? "text" : "password"}
            placeholder="Min. 8 caractères"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClassName}
            required
            minLength={8}
            aria-invalid={!!errors.password}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground size-9"
            aria-label={
              showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
            }
          >
            {showPassword ? (
              <EyeOff className="size-5" />
            ) : (
              <Eye className="size-5" />
            )}
          </Button>
        </div>
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="signup-name"
          className="text-sm font-semibold text-foreground"
        >
          Votre nom (optionnel)
        </Label>
        <Input
          id="signup-name"
          type="text"
          placeholder="Jean Dupont"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClassName}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name}</p>
        )}
      </div>
      <Button
        type="submit"
        className="h-14 w-full rounded-lg text-lg font-bold shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
        disabled={signup.isPending}
      >
        {signup.isPending ? "Création en cours…" : "Créer mon compte vendeur"}
      </Button>
      <p className="px-4 text-center text-xs text-muted-foreground">
        En vous inscrivant, vous acceptez nos{" "}
        <Link href="/conditions-utilisation" className="text-primary hover:underline">
          Conditions d&apos;utilisation
        </Link>{" "}
        et notre{" "}
        <Link href="/politique-confidentialite" className="text-primary hover:underline">
          Politique de confidentialité
        </Link>
        .
      </p>
    </form>
  );
}

function LoginPageContent() {
  const searchParams = useSearchParams();

  const tabFromUrl = searchParams.get("tab");
  const initialTab: Tab = useMemo(
    () => (tabFromUrl === "signup" ? "signup" : "login"),
    [tabFromUrl]
  );
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [slideDir, setSlideDir] = useState<"left" | "right">("right");

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const setTab = (t: Tab) => {
    setSlideDir(t === "signup" ? "right" : "left");
    setActiveTab(t);
    const url = t === "signup" ? "/login?tab=signup" : "/login";
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="max-w-[480px] w-full flex flex-col gap-8">
      <div className="animate-entrance animate-fade-up flex flex-col gap-2" style={{ animationDelay: "100ms" }}>
        <h2 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">
          {activeTab === "login"
            ? "Connexion à votre compte"
            : "Créer un compte vendeur"}
        </h2>
        <p className="text-muted-foreground">
          {activeTab === "login"
            ? "Bienvenue. Saisissez vos identifiants pour accéder à votre dashboard."
            : "Rejoignez plus de 10 000 entreprises qui automatisent leurs ventes WhatsApp."}
        </p>
      </div>

      {/* Tab switcher with sliding indicator */}
      <div
        className="animate-entrance animate-fade-up relative flex rounded-xl border border-border bg-muted/40 p-1"
        style={{ animationDelay: "250ms" }}
      >
        {/* Sliding pill indicator */}
        <div
          className="absolute inset-y-1 rounded-lg bg-primary shadow-lg shadow-primary/25 transition-[left] duration-300 ease-out"
          style={{
            width: "calc(50% - 4px)",
            left: activeTab === "login" ? "4px" : "50%",
          }}
        />
        <button
          type="button"
          onClick={() => setTab("login")}
          className={`relative z-10 flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors duration-200 ${
            activeTab === "login"
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Connexion
        </button>
        <button
          type="button"
          onClick={() => setTab("signup")}
          className={`relative z-10 flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors duration-200 ${
            activeTab === "signup"
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Créer un compte
        </button>
      </div>

      {/* Form content with directional slide */}
      <div
        key={activeTab}
        className={`auth-tab-slide ${slideDir === "right" ? "auth-tab-slide-right" : "auth-tab-slide-left"}`}
      >
        {activeTab === "login" ? <LoginTabContent /> : <SignupTabContent />}
      </div>

      <div className="animate-entrance animate-fade-up flex items-center justify-center gap-2 pt-4 text-sm" style={{ animationDelay: "500ms" }}>
        <span className="text-muted-foreground">
          {activeTab === "login" ? "Pas encore de compte ?" : "Vous avez déjà un compte ?"}
        </span>
        <button
          type="button"
          className="font-bold text-primary hover:underline"
          onClick={() => setTab(activeTab === "login" ? "signup" : "login")}
        >
          {activeTab === "login" ? "S'inscrire" : "Se connecter"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Chargement…</p>}>
      <LoginPageContent />
    </Suspense>
  );
}
