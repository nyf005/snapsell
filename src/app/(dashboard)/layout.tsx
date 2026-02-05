import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
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
  const tenant = await db.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true },
  });

  const canManageGridRole = canManageGrid(session.user.role as string);

  return (
    <SidebarProvider>
      <AppSidebar
        userName={session.user.name ?? session.user.email ?? ""}
        tenantName={tenant?.name ?? "—"}
        canManageGrid={canManageGridRole}
      />
      <SidebarInset>
        <div className="flex flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
