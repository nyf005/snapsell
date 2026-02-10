import { redirect } from "next/navigation";

import { isOpsUser } from "~/lib/rbac";
import { auth } from "~/server/auth";

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Vérifier accès ops via role (Story 7B.1 AC5)
  if (!isOpsUser(session.user.role)) {
    redirect("/dashboard"); // Rediriger vers dashboard si pas ops
  }

  return <>{children}</>;
}
