import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { SubscriptionContent } from "./_components/subscription-content";

export const metadata = {
  title: "Abonnement | SnapSell",
  description: "Gérer votre abonnement, consulter votre usage et votre historique de paiements.",
};

export default async function AbonnementPage() {
  const session = await auth();

  // AC #5: Non-OWNER/MANAGER → redirect to dashboard
  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    redirect("/dashboard");
  }

  return <SubscriptionContent />;
}
