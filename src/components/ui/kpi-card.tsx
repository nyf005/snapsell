import * as React from "react";

import { Card, CardDescription, CardHeader } from "~/components/ui/card";
import { cn } from "~/lib/utils";

const KPI_ICON_VARIANTS = {
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
} as const;

type KpiIconVariant = keyof typeof KPI_ICON_VARIANTS;

type KpiCardProps = {
  /** Libellé au-dessus de la valeur (ex. "Total des catégories") */
  label: string;
  /** Valeur affichée (nombre, chaîne, "—") */
  value: React.ReactNode;
  /** Icône Lucide (composant, ex. Layers) */
  icon: React.ComponentType<{ className?: string }>;
  /** Variante de couleur de l’icône */
  iconVariant?: KpiIconVariant;
  /** Optionnel : tendance affichée sous la valeur (ex. "+12% vs hier") */
  trend?: React.ReactNode;
  /** Optionnel : className pour la ligne tendance (défaut: text-success) */
  trendClassName?: string;
  /** Optionnel : className pour le paragraphe valeur (ex. retirer tabular-nums pour les dates) */
  valueClassName?: string;
  /** Optionnel : className pour la Card */
  className?: string;
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  iconVariant = "primary",
  trend,
  trendClassName,
  valueClassName,
  className,
}: KpiCardProps) {
  return (
    <Card
      className={cn(
        "border-border transition-shadow hover:shadow-md",
        className
      )}
    >
      <CardHeader className="flex flex-row items-center gap-4 pb-2">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            KPI_ICON_VARIANTS[iconVariant]
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </CardDescription>
          <p
            className={cn(
              !valueClassName && "text-xl font-bold tabular-nums md:text-2xl",
              valueClassName
            )}
          >
            {value}
          </p>
          {trend != null && (
            <p
              className={cn(
                "text-xs font-bold flex items-center gap-1 mt-1",
                trendClassName ?? "text-success"
              )}
            >
              {trend}
            </p>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
