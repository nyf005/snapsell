import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { DeliveryFeesContent } from "../_components/delivery-fees-content";

export const metadata = {
  title: "Frais de livraison | SnapSell",
  description: "Prix par zone ou par commune pour votre tenant.",
};

export default async function LivraisonPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    redirect("/dashboard");
  }

  return <DeliveryFeesContent />;
}
