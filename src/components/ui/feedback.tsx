"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { formatError, type ErrorContext, type UserError } from "~/lib/copy";
import { cn } from "~/lib/utils";

/**
 * Système de retour d'action — « Une action produit un retour clair » (PRODUCT.md § 5).
 *
 * Règle d'aiguillage (à respecter aux points d'appel) :
 *   • Erreur exigeant une correction de l'utilisateur  → alerte EN LIGNE (<ErrorAlert>),
 *     près du champ concerné. Jamais un toast : il disparaît avant la correction.
 *   • Succès dont le résultat n'est PAS visible à l'écran (réglage enregistré,
 *     invitation envoyée, connexion testée) → toast.
 *   • Succès dont le résultat EST visible (une ligne apparaît, un badge change)
 *     → rien. Le changement est déjà le retour.
 *
 * Écrit dans le repo plutôt qu'importé : la barre de navigation mobile est en
 * `fixed bottom-0` avec `env(safe-area-inset-bottom)`, et les toasts doivent se
 * placer au-dessus d'elle. C'est la partie difficile, et elle serait à écrire de
 * toute façon par-dessus une bibliothèque externe.
 */

type FeedbackTone = "success" | "error" | "info";

type FeedbackItem = {
  id: number;
  tone: FeedbackTone;
  title: string;
  detail?: string;
};

type FeedbackContextValue = {
  success: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  /** Accepte un UserError déjà formaté ou une erreur brute. */
  error: (error: UserError | unknown, context?: ErrorContext) => void;
  dismiss: (id: number) => void;
};

const FeedbackContext = React.createContext<FeedbackContextValue | null>(null);

/** Les succès s'effacent seuls ; les erreurs attendent une action. */
const SUCCESS_TIMEOUT_MS = 4_000;
const MAX_VISIBLE = 3;

function isUserError(value: unknown): value is UserError {
  return (
    typeof value === "object" &&
    value !== null &&
    "title" in value &&
    typeof (value as UserError).title === "string"
  );
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<FeedbackItem[]>([]);
  const nextId = React.useRef(0);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = React.useCallback(
    (tone: FeedbackTone, title: string, detail?: string) => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, tone, title, detail }].slice(-MAX_VISIBLE));
      if (tone !== "error") {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), SUCCESS_TIMEOUT_MS),
        );
      }
    },
    [dismiss],
  );

  // Purge les minuteurs en cours si le provider est démonté.
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = React.useMemo<FeedbackContextValue>(
    () => ({
      success: (title, detail) => push("success", title, detail),
      info: (title, detail) => push("info", title, detail),
      error: (error, context) => {
        const formatted = isUserError(error) ? error : formatError(error, context);
        push("error", formatted.title, formatted.detail);
      },
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackRegion items={items} onDismiss={dismiss} />
    </FeedbackContext.Provider>
  );
}

const TONE_STYLES: Record<FeedbackTone, { icon: typeof Info; className: string }> = {
  success: {
    icon: CheckCircle2,
    className: "border-primary/30 bg-primary/10 text-foreground",
  },
  error: {
    icon: AlertCircle,
    className: "border-destructive/40 bg-destructive/10 text-foreground",
  },
  info: {
    icon: Info,
    className: "border-border bg-surface text-foreground",
  },
};

function FeedbackRegion({
  items,
  onDismiss,
}: {
  items: FeedbackItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      // Au-dessus de la barre mobile (h-18 + safe area), en bas à droite sur desktop.
      className={cn(
        "pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4",
        "bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.5rem)]",
        "md:inset-x-auto md:right-4 md:bottom-4 md:items-end md:px-0",
      )}
    >
      {items.map((item) => {
        const { icon: Icon, className } = TONE_STYLES[item.tone];
        const isError = item.tone === "error";
        return (
          <div
            key={item.id}
            role={isError ? "alert" : "status"}
            aria-live={isError ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border p-3 shadow-lg backdrop-blur",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
              className,
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-5 shrink-0",
                isError ? "text-destructive" : "text-primary",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.title}</p>
              {item.detail && (
                <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{item.detail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label="Fermer"
              className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Accès au système de retour. Doit être appelé sous <FeedbackProvider>. */
export function useFeedback(): FeedbackContextValue {
  const ctx = React.useContext(FeedbackContext);
  if (!ctx) {
    throw new Error("useFeedback doit être utilisé à l’intérieur de <FeedbackProvider>.");
  }
  return ctx;
}
