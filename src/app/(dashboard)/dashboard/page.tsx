import { redirect } from "next/navigation";
import { formatDate } from "~/lib/copy";
import { canManageGrid, isOpsUser } from "~/lib/rbac";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import {
  WelcomeCard,
  shouldShowWelcome,
} from "~/app/(dashboard)/_components/welcome-card";
import { DashboardContent } from "./_components/dashboard-content";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Un user OPS n'a pas de tenant → rediriger vers la console ops
  if (isOpsUser(session.user.role) || !session.user.tenantId) {
    redirect("/ops/whatsapp");
  }

  const role = session.user.role as string;

  const [tenant, user] = await Promise.all([
    db.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true, showUpgradeBanner: true },
    }),
    // `createdAt` sert uniquement à l'accueil des personnes invitées — voir
    // `welcome-card.tsx` : sept jours dérivés, aucune colonne de suivi.
    session.user.id
      ? db.user.findUnique({
          where: { id: session.user.id },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
  ]);

  const tenantName = tenant?.name;

  return (
    <>
      <DashboardHeader />
      <main className="flex-1 min-h-0 overflow-y-auto bg-background">
        <div className="p-4 sm:p-6 md:p-8">
          <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Aujourd’hui</h1>
              {tenantName && (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    {tenantName}
                  </p>
                </div>
              )}
            </div>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
              <span className="text-sm font-semibold text-muted-foreground">
                {formatDate(new Date())}
              </span>
            </div>
          </header>
          {shouldShowWelcome(role, user?.createdAt) && (
            <div className="mb-8">
              <WelcomeCard role={role} />
            </div>
          )}
          <DashboardContent
            showUpgradeBanner={tenant?.showUpgradeBanner ?? false}
            canManageSubscription={canManageGrid(role)}
          />
        </div>
      </main>
    </>
  );
}
