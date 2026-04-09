import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { FaqSettingsContent } from "./_components/faq-settings-content";

export const metadata = {
  title: "FAQ automatique | SnapSell",
  description: "Configurer les réponses FAQ automatiques envoyées par le bot WhatsApp.",
};

export default async function FaqSettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    redirect("/dashboard");
  }

  return <FaqSettingsContent />;
}
