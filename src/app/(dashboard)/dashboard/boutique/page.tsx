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
  const [catalogueCount, teamCount, tenant, zones, communes] = await Promise.all([
    db.catalogueItem.count({ where: { tenantId } }),
    canManage ? db.user.count({ where: { tenantId } }) : Promise.resolve(null),
    db.tenant.findUnique({ where: { id: tenantId }, select: { metaPhoneNumberId: true, metaWabaId: true, metaAccessToken: true, assistantEnabled: true, creditsBalance: true, creditsBonus: true } }),
    db.deliveryZone.count({ where: { tenantId } }),
    db.deliveryFeeCommune.count({ where: { tenantId } }),
  ]);
  const summaries: Record<string, string> = {
    ...shortDescriptions,
    "/parametres/whatsapp": tenant?.metaPhoneNumberId && tenant.metaWabaId && tenant.metaAccessToken ? `Numéro configuré · assistant ${tenant.assistantEnabled ? "activé" : "en pause"}` : "Numéro WhatsApp à connecter",
    "/parametres/livraison": zones + communes > 0 ? `${zones + communes} tarif${zones + communes > 1 ? "s" : ""} de livraison configuré${zones + communes > 1 ? "s" : ""}` : "Tarifs de livraison à configurer",
    ...(canManage && tenant ? { "/parametres/abonnement": `${Math.max(0, tenant.creditsBalance + tenant.creditsBonus).toLocaleString("fr-FR")} conversations disponibles` } : {}),
    "/dashboard/catalogue": `${catalogueCount} article${catalogueCount > 1 ? "s" : ""} dans votre catalogue`,
    ...(teamCount !== null ? { "/parametres/team": `${teamCount} membre${teamCount > 1 ? "s" : ""} dans votre équipe` } : {}),
  };
  return <>
    <DashboardHeader />
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="space-y-8 p-4 pb-8 md:p-6 md:pb-10">
        <TaskPageHeader href="/dashboard/boutique" />
        <ul aria-label="Les accès de votre boutique" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {boutiqueGroupsFor(canManage).flatMap((group) => group.items).map((item) => {
                const Icon = item.icon;
                return <li key={item.href}><Link href={item.href} className="group flex h-full min-h-36 flex-col items-start gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:p-6">
                  <span className="flex w-full items-center justify-between"><Icon className="size-5 text-primary" aria-hidden="true" /><ArrowRight className="size-4 text-muted-foreground group-hover:text-primary" aria-hidden="true" /></span>
                  <span className="space-y-1"><span className="block text-base font-semibold">{item.label}</span><span className="block text-sm text-muted-foreground">{summaries[item.href] ?? item.description}</span></span>
                </Link></li>;
              })}
        </ul>
      </div>
    </main>
  </>;
}
