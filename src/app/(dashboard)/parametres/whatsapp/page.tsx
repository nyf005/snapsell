import { redirect } from "next/navigation";

import { canManageGrid } from "~/lib/rbac";
import { isWhatsAppSupportEmail } from "~/lib/support-access";
import { auth } from "~/server/auth";

import { SettingsAccessDenied } from "../_components/settings-access-denied";

import { WhatsAppConfigContent } from "../_components/whatsapp-config-content";

export const metadata = {
  title: "WhatsApp | SnapSell",
  description: "Configurer la connexion API WhatsApp Meta.",
};

export default async function WhatsAppParametresPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    return <SettingsAccessDenied />;
  }

  return (
    <WhatsAppConfigContent
      showSupportConfiguration={isWhatsAppSupportEmail(session.user.email)}
    />
  );
}
