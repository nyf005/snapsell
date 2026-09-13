import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "~/components/ui/button";
import { marketing } from "~/lib/copy/marketing";

import { WhatsappOrderVisual } from "./whatsapp-order-visual";

export function HeroSection({ user }: { user?: { name?: string | null } | null }) {
  return (
    <section className="bg-background px-5 py-12 sm:px-6 lg:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
        <div>
          <p className="mb-4 text-sm font-medium text-primary">{marketing.audience}</p>
          <h1 className="max-w-xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Vos commandes WhatsApp, <span className="text-primary">enfin organisées.</span></h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">SnapSell réserve les articles, collecte les coordonnées et rassemble les preuves de paiement. Vous vérifiez les acomptes et préparez les commandes.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="min-h-12 px-5"><Link href={user ? "/dashboard" : "/login?tab=signup"}>{user ? "Aller au tableau de bord" : marketing.cta.signup}<ArrowRight className="ml-2 size-4" /></Link></Button>
            <Button asChild variant="outline" className="min-h-12 px-5"><Link href="#fonctionnement">{marketing.cta.how}</Link></Button>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4" aria-hidden="true" />Plan gratuit permanent, sans carte bancaire.</p>
        </div>
        <WhatsappOrderVisual />
      </div>
    </section>
  );
}
