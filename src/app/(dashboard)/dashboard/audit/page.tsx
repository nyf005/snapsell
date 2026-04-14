import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { AuditTrailContent } from "./_components/audit-trail-content";

export default async function AuditPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role as string | undefined;
  const canManageRole = role === "OWNER" || role === "MANAGER";

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
