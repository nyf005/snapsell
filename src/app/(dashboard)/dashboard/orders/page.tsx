import { redirect } from "next/navigation";
import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { OrdersListContent } from "./_components/orders-list-content";

/**
 * L'écran est ouvert à tous les rôles tenant — traiter une commande est le
 * travail de l'Agent et de la Vente, cf. l'en-tête de `routers/orders.ts`.
 * Seul le bouton d'export reste conditionné au rôle, en miroir du gating
 * `managerProcedure` que garde `orders.exportCsv`.
 */
export default async function OrdersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

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

  return <OrdersListContent canExportCsv={canExportCsv} />;
}
