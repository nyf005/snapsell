"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";

/**
 * Thème clair / sombre.
 *
 * Le thème était figé en dur (`className="dark"` sur <html>), alors que DESIGN.md
 * donne la priorité au clair. Plutôt que d'imposer l'un ou l'autre, on suit la
 * préférence du système par défaut, avec un choix explicite persisté.
 *
 * Écrit dans le repo plutôt qu'importé (pas de `next-themes`) : la seule partie
 * délicate est d'éviter le flash au chargement, et elle tient dans le script inline
 * ci-dessous, qui doit s'exécuter **avant le premier rendu**.
 */

export const THEME_STORAGE_KEY = "snapsell-theme";

export type ThemePreference = "light" | "dark" | "system";

/**
 * Faut-il appliquer le thème sombre ?
 *
 * Fonction pure, partagée entre le script d'initialisation et le provider, pour que
 * le rendu avant hydratation et le rendu React ne puissent pas diverger.
 */
export function shouldUseDark(
  stored: string | null,
  prefersDark: boolean,
): boolean {
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return prefersDark;
}

/**
 * Script exécuté avant la peinture pour appliquer le thème sans clignotement.
 * Injecté dans <head> par le layout racine.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    // Même règle que shouldUseDark() ci-dessus.
    var dark = stored === "dark" ? true : stored === "light" ? false : prefersDark;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {
    // localStorage indisponible (navigation privée) : on garde le thème système.
  }
})();
`.trim();

function applyTheme(preference: ThemePreference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const stored = preference === "system" ? null : preference;
  document.documentElement.classList.toggle("dark", shouldUseDark(stored, prefersDark));
}

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>("system");

  // Le script inline a déjà appliqué la classe ; on ne fait que récupérer le choix.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setPreferenceState(stored);
      }
    } catch {
      // Ignoré : on reste sur « système ».
    }
  }, []);

  // Suivre le système en direct tant qu'aucun choix explicite n'est fait.
  React.useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = React.useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignoré : le choix vaut pour la session en cours.
    }
  }, []);

  const value = React.useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme doit être utilisé à l’intérieur de <ThemeProvider>.");
  }
  return ctx;
}

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Comme mon téléphone", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[2]!;
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Apparence : ${current.label}`}
          className={cn("text-muted-foreground", className)}
        >
          <CurrentIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setPreference(option.value)}
              className={cn(preference === option.value && "font-semibold text-primary")}
            >
              <Icon className="size-4" />
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
