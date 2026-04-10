import { redirect } from "next/navigation";

import { canManageGrid, isOpsUser } from "~/lib/rbac";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

import { AppSidebar } from "~/app/(dashboard)/_components/app-sidebar";
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
    <SidebarProvider className="h-screen overflow-hidden">
      <AppSidebar
        userName={session.user.name ?? session.user.email ?? ""}
        tenantName={tenant.name}
        canManageGrid={canManageGridRole}
        showBranding={tenant.showBranding}
      />
      <SidebarInset className="flex flex-1 flex-col min-h-0 overflow-hidden">
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
