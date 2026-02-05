import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { PricingGridContent } from "./_components/pricing-grid-content";

export const metadata = {
  title: "Grille de prix | SnapSell",
  description: "Configurer la grille catégories→prix pour votre tenant.",
};

export default async function ParametresPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    redirect("/dashboard");
  }

  return <PricingGridContent />;
}
