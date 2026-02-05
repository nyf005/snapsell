import { redirect } from "next/navigation";

import { auth } from "~/server/auth";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const tenantId = session.user.tenantId;

  return (
    <>
      <DashboardHeader />
      <main className="auth-page-bg flex flex-1 flex-col text-white">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold">Tableau de bord</h1>
          <p className="mt-2 text-white/80">
            Bienvenue, {session.user.name ?? session.user.email}.
          </p>
          <p className="mt-1 text-sm text-white/60">
            ID tenant (isolation) : {tenantId ?? "—"}
          </p>
        </div>
      </main>
    </>
  );
}
