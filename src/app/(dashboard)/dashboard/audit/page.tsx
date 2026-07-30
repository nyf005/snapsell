import { redirect } from "next/navigation";
import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { AuditTrailContent } from "./_components/audit-trail-content";

export default async function AuditPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // `canManageGrid` plutôt qu'une comparaison à la main, comme sur la page des
  // commandes : la liste des rôles de gestion vit dans `~/lib/rbac`.
  const canManageRole = canManageGrid(session.user.role as string);

  const tenantId = session.user.tenantId;
  let canExportCsv = false;
  if (canManageRole && tenantId) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { hasExportCsv: true },
    });
    canExportCsv = tenant?.hasExportCsv ?? false;
  }

  return <AuditTrailContent tenantId={tenantId} canExportCsv={canExportCsv} />;
}
