import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { canManageGrid } from "~/lib/rbac";
import { LiveOpsContent } from "./_components/live-ops-content";

export default async function LivePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fdashboard%2Flive");
  }

  return <LiveOpsContent canManageAssistant={canManageGrid(session.user.role as string)} />;
}
