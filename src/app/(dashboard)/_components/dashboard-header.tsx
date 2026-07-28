"use client";

import { DashboardSidebarTrigger } from "~/app/(dashboard)/_components/sidebar-trigger";
import { ThemeToggle } from "~/components/ui/theme";

type DashboardHeaderProps = {
  /** Contenu à gauche (titre, breadcrumb, etc.) */
  left?: React.ReactNode;
  /** Contenu à droite (actions, icônes) */
  right?: React.ReactNode;
};

export function DashboardHeader({ left, right }: DashboardHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:h-[65px] md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <DashboardSidebarTrigger />
        {left != null ? (
          <>
            <div className="hidden h-4 w-px shrink-0 bg-border sm:block" />
            <div className="flex min-w-0 flex-1 items-center gap-2">{left}</div>
          </>
        ) : null}
      </div>
      {/* Le sélecteur d'apparence remplace le bouton de notifications mort. */}
      <div className="flex shrink-0 items-center gap-2">
        {right}
        <ThemeToggle />
      </div>
    </header>
  );
}
