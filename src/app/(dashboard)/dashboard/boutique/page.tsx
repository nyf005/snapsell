import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "~/server/db";
import { auth } from "~/server/auth";
import { canManageGrid } from "~/lib/rbac";
import { boutiqueGroupsFor } from "~/lib/navigation";
import { DashboardHeader } from "../../_components/dashboard-header";
import { TaskPageHeader } from "../../_components/task-page-header";

export const metadata = { title: "Boutique | SnapSell" };

const shortDescriptions: Record<string, string> = {
  "/parametres/prix": "Les prix appliqués à vos codes articles.",
  "/parametres/livraison": "Les tarifs par zone de livraison.",
  "/parametres/whatsapp": "Votre numéro et son état de connexion.",
  "/parametres/reponses": "Les réponses envoyées par l’assistant.",
  "/parametres/team": "Les personnes et leurs droits d’accès.",
  "/parametres/abonnement": "Votre offre, vos conversations et vos paiements.",
  "/dashboard/audit": "Les actions passées dans votre boutique.",
};

export default async function BoutiquePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const canManage = canManageGrid(session.user.role ?? "");
  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/login");
  const [catalogueCount, teamCount] = await Promise.all([
    db.catalogueItem.count({ where: { tenantId } }),
    canManage ? db.user.count({ where: { tenantId } }) : Promise.resolve(null),
  ]);
  const summaries: Record<string, string> = {
    ...shortDescriptions,
    "/dashboard/catalogue": `${catalogueCount} article${catalogueCount > 1 ? "s" : ""} dans votre catalogue`,
    ...(teamCount !== null ? { "/parametres/team": `${teamCount} membre${teamCount > 1 ? "s" : ""} dans votre équipe` } : {}),
  };
  return <>
    <DashboardHeader />
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="space-y-5 p-4 md:p-6">
        <TaskPageHeader href="/dashboard/boutique" />
        {boutiqueGroupsFor(canManage).map((group) => {
          const items = group.items;
          return <section key={group.title} aria-label={group.title} className="space-y-2">
            <h2 className="text-lg font-semibold">{group.title}</h2>
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const Icon = item.icon;
                return <li key={item.href}><Link href={item.href} className="flex min-h-16 items-center gap-3 rounded-lg py-4 pr-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
                  <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex-1"><span className="block font-medium">{item.label}</span><span className="block text-sm text-muted-foreground">{summaries[item.href] ?? item.description}</span></span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </Link></li>;
              })}
            </ul>
          </section>;
        })}
      </div>
    </main>
  </>;
}
