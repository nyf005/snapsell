import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";

import { WhatsAppConfigContent } from "../_components/whatsapp-config-content";

export const metadata = {
  title: "Connexion WhatsApp | SnapSell",
  description: "Configurer le numéro WhatsApp de votre boutique.",
};

export default async function WhatsAppParametresPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    redirect("/dashboard");
  }

  return <WhatsAppConfigContent />;
}
