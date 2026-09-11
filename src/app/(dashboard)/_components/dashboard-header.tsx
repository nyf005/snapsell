"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
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
        <Link href="/aide" aria-label="Aide" className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><HelpCircle className="size-5" aria-hidden="true" /></Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
