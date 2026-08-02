import { redirect } from "next/navigation";

import { canManageGrid, isOpsUser } from "~/lib/rbac";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

import { AppSidebar } from "~/app/(dashboard)/_components/app-sidebar";
import { MobileBottomNav } from "~/app/(dashboard)/_components/mobile-bottom-nav";
import { FeedbackProvider } from "~/components/ui/feedback";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Un user OPS n'a pas de tenant → le rediriger vers la console ops
  if (isOpsUser(session.user.role)) {
    redirect("/ops/logs");
  }

  const userId = session.user.id;
  const tenantId = session.user.tenantId;
  if (!userId || !tenantId) {
    redirect("/logout");
  }

  const [user, tenant] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, showBranding: true, showUpgradeBanner: true },
    }),
  ]);

  if (!user || !tenant) {
    redirect("/logout");
  }

  const canManageGridRole = canManageGrid(session.user.role as string);

  return (
    <FeedbackProvider>
      {/*
        `h-dvh` et non `h-screen` : sur mobile, `100vh` vaut la hauteur du
        viewport LARGE, barre d'adresse rétractée. La coquille dépassait donc le
        visible de la hauteur de cette barre, et son dernier élément — la
        `MobileBottomNav` — se retrouvait dessous. `100dvh` suit la hauteur
        réellement visible.
      */}
      <SidebarProvider className="h-dvh overflow-hidden">
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform focus:translate-y-0"
        >
          Aller au contenu
        </a>
        <AppSidebar
          userName={session.user.name ?? session.user.email ?? ""}
          // Distinct de `userName`, qui peut être un prénom : le changement de
          // mot de passe doit nommer le compte concerné, et les gestionnaires
          // de mots de passe ont besoin de l'identifiant réel.
          userEmail={session.user.email ?? ""}
          tenantName={tenant.name}
          canManageGrid={canManageGridRole}
          showBranding={tenant.showBranding}
        />
        <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            id="main-content"
            className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0"
          >
            {children}
          </div>
        </SidebarInset>
        <MobileBottomNav canManageGrid={canManageGridRole} />
      </SidebarProvider>
    </FeedbackProvider>
  );
}
