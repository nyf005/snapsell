import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { SettingsAccessDenied } from "../_components/settings-access-denied";
import { AutoRepliesContent } from "./_components/auto-replies-content";

export const metadata = {
  title: "Réponses automatiques | SnapSell",
  description: "Ce que l’assistant répond en votre absence.",
};

export default async function ReponsesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    return <SettingsAccessDenied />;
  }

  return <AutoRepliesContent />;
}
