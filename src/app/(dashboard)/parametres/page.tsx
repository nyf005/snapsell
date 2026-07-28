import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { SettingsAccessDenied } from "./_components/settings-access-denied";
import { SettingsIndexContent } from "./_components/settings-index-content";

export const metadata = {
  title: "Paramètres | SnapSell",
  description: "Tous vos réglages au même endroit.",
};

export default async function ParametresPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // On garde l'URL et on explique, plutôt que de rediriger sans un mot.
  if (!canManageGrid(session.user.role as string)) {
    return <SettingsAccessDenied />;
  }

  return <SettingsIndexContent />;
}
