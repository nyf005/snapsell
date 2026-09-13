import { getOrderByIdInputSchema } from "~/server/api/routers/orders.schema";
import { redirect } from "next/navigation";
import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { ORDER_WORK_VIEW_STATUSES, type OrderWorkView } from "~/lib/copy/orders";
import { OrdersListContent } from "./_components/orders-list-content";

/**
 * L'écran est ouvert à tous les rôles tenant — traiter une commande est le
 * travail de l'Agent et de la Vente, cf. l'en-tête de `routers/orders.ts`.
 * Seul le bouton d'export reste conditionné au rôle, en miroir du gating
 * `managerProcedure` que garde `orders.exportCsv`.
 */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ view?: string; payment?: string; order?: string }> }) {
  const params = await searchParams;
  const requestedOrder = getOrderByIdInputSchema.safeParse({ orderId: params.order });
  const requestedView = params.payment === "review" ? "" : params.view;
  const initialView: OrderWorkView = requestedView !== undefined && Object.hasOwn(ORDER_WORK_VIEW_STATUSES, requestedView) ? requestedView as OrderWorkView : "to_process";
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

  return <OrdersListContent initialOrderId={requestedOrder.success ? requestedOrder.data.orderId : undefined} canExportCsv={canExportCsv} initialView={initialView} initialPayment={params.payment === "review" ? "review" : ""} />;
}
