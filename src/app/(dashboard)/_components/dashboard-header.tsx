"use client";

import { DashboardSidebarTrigger } from "~/app/(dashboard)/_components/sidebar-trigger";

type DashboardHeaderProps = {
  /** Contenu à gauche (titre, breadcrumb, etc.) */
  left?: React.ReactNode;
  /** Contenu à droite (actions, icônes) */
  right?: React.ReactNode;
};

export function DashboardHeader({ left, right }: DashboardHeaderProps) {
  return (
    <header className="flex h-[65px] shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <DashboardSidebarTrigger />
        {left != null ? (
          <>
            <div className="h-4 w-px shrink-0 bg-border" />
            <div className="flex min-w-0 flex-1 items-center gap-2">{left}</div>
          </>
        ) : null}
      </div>
      {right != null ? (
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      ) : null}
    </header>
  );
}
