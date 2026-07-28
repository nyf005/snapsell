import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { SettingsAccessDenied } from "../_components/settings-access-denied";

import { DeliveryFeesContent } from "../_components/delivery-fees-content";

export const metadata = {
  title: "Frais de livraison | SnapSell",
  description: "Définir les frais de livraison par zone ou par commune.",
};

export default async function LivraisonPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    return <SettingsAccessDenied />;
  }

  return <DeliveryFeesContent />;
}
