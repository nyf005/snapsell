import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { AuditTrailContent } from "./_components/audit-trail-content";

export default async function AuditPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <AuditTrailContent />;
}
