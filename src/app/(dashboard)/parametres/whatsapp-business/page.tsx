import { redirect } from "next/navigation";
import { canManageGrid } from "~/lib/rbac";
import { auth } from "~/server/auth";
import { WhatsAppBusinessConfigContent } from "../_components/whatsapp-business-config-content";

export const metadata = {
  title: "WhatsApp Business | SnapSell",
  description: "Configurer les horaires et le catalogue Meta Commerce.",
};

export default async function WhatsAppBusinessParametresPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageGrid(session.user.role as string)) {
    redirect("/dashboard");
  }

  return <WhatsAppBusinessConfigContent />;
}
