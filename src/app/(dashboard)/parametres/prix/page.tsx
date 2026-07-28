import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { SettingsAccessDenied } from "../_components/settings-access-denied";
import { PricingGridContent } from "../_components/pricing-grid-content";

export const metadata = {
  title: "Prix | SnapSell",
  description: "Définir le prix appliqué aux codes de vos articles.",
};

export default async function PrixPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    return <SettingsAccessDenied />;
  }

  return <PricingGridContent />;
}
