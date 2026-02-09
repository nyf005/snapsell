import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { OrdersListContent } from "./_components/orders-list-content";

export default async function OrdersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role as string | undefined;
  const canExportCsv = role === "OWNER" || role === "MANAGER";

  return <OrdersListContent canExportCsv={canExportCsv} />;
}
