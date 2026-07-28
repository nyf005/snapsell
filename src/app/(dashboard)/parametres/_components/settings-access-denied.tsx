import Link from "next/link";
import { Lock } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { DashboardEmptyState } from "~/app/(dashboard)/_components/dashboard-empty-state";
import { ui } from "~/lib/copy";

/**
 * Affiché à la place d'une page de paramètres à laquelle le rôle n'a pas accès.
 *
 * Les pages redirigeaient silencieusement vers `/dashboard` : un AGENT qui suivait
 * un lien partagé se retrouvait ailleurs sans explication. On garde l'URL et on dit
 * pourquoi. Les données restent protégées côté serveur de toute façon.
 */
export function SettingsAccessDenied() {
  return (
    <>
      <DashboardHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background p-4 md:p-8">
        <DashboardEmptyState
          icon={Lock}
          title={ui.accessDenied.title}
          description={ui.accessDenied.detail}
          action={
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {ui.accessDenied.action}
            </Link>
          }
        />
      </main>
    </>
  );
}
