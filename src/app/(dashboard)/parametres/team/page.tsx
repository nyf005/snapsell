import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { SettingsAccessDenied } from "../_components/settings-access-denied";

import { TeamContent } from "../_components/team-content";

export const metadata = {
  title: "Équipe | SnapSell",
  description: "Gérer les membres de votre équipe et inviter des agents.",
};

export default async function TeamParametresPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    return <SettingsAccessDenied />;
  }

  return <TeamContent />;
}
