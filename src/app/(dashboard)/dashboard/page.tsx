import { redirect } from "next/navigation";
import { isOpsUser } from "~/lib/rbac";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { DashboardContent } from "./_components/dashboard-content";

function formatDashboardDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Un user OPS n'a pas de tenant → rediriger vers la console ops
  if (isOpsUser(session.user.role) || !session.user.tenantId) {
    redirect("/ops/logs");
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, showUpgradeBanner: true },
  });

  const userName = session.user.name ?? session.user.email ?? "Utilisateur";
  const tenantName = tenant?.name;

  return (
    <>
      <DashboardHeader />
      <main className="flex-1 min-h-0 overflow-y-auto bg-background">
        <div className="p-6 md:p-8">
          <header className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Bienvenue,{" "}
                <span className="text-primary">{userName}</span>
              </h1>
              {tenantName && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="size-2 rounded-full bg-primary shrink-0" />
                  <p className="text-sm font-medium text-foreground">
                    {tenantName}
                  </p>
                </div>
              )}
            </div>
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-card-foreground shadow-sm shrink-0">
              <span className="text-sm font-semibold text-muted-foreground">
                {formatDashboardDate(new Date())}
              </span>
            </div>
          </header>
          <DashboardContent showUpgradeBanner={tenant?.showUpgradeBanner ?? false} />
        </div>
      </main>
    </>
  );
}
