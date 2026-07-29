import { type Metadata } from "next";

import { LandingHeader } from "~/app/_components/landing/landing-header";
import { HeroSection } from "~/app/_components/landing/hero-section";
import { CoreSection } from "~/app/_components/landing/core-section";
import { FeaturesSection } from "~/app/_components/landing/features-section";
import { HowItWorksSection } from "~/app/_components/landing/how-it-works-section";
import { CtaSection } from "~/app/_components/landing/cta-section";
import { LandingFooter } from "~/app/_components/landing/landing-footer";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  metadataBase: new URL("https://snapsell.app"),
  title: "SnapSell — Vendez sur WhatsApp sans rien noter à la main",
  description:
    "Un code sur WhatsApp, et l’article est réservé, l’adresse collectée, la preuve de paiement enregistrée. Catalogue, commandes et livraison au même endroit.",
  openGraph: {
    title: "SnapSell — Vendez sur WhatsApp sans rien noter à la main",
    description:
      "Un code sur WhatsApp, et l’article est réservé, l’adresse collectée, la preuve de paiement enregistrée. Catalogue, commandes et livraison au même endroit.",
    url: "https://snapsell.app",
    siteName: "SnapSell",
    type: "website",
    locale: "fr_FR",
    images: [{ url: "/logo.png", width: 500, height: 500, alt: "SnapSell" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SnapSell — Vendez sur WhatsApp sans rien noter à la main",
    description:
      "Un code sur WhatsApp, et l’article est réservé, l’adresse collectée, la preuve de paiement enregistrée. Catalogue, commandes et livraison au même endroit.",
  },
};

export default async function Home() {
  const session = await auth();

  return (
    <>
      <LandingHeader user={session?.user ? { name: session.user.name, email: session.user.email! } : null} />
      <main id="main-content">
        <HeroSection user={session?.user ? { name: session.user.name ?? undefined } : null} />
        {/*
          Ordre du récit, une section = un métier :
            Hero      → la douleur, la promesse, la démonstration
            Core      → le même mardi, désordonné puis rangé
            Features  → le détail, preuves à l'appui (ouvert par la frise du
                        parcours, qui en est le sommaire)
            HowItWorks→ la mise en route, côté boutique
            Cta       → l'inscription

          `JourneySection` a disparu en tant que section : son bloc de titre
          pesait 152px pour une frise de 82, et sa place entre Core et Features
          coupait le récit sans rien y ajouter. La frise vit maintenant en tête
          de Features (`journey-strip.tsx`), où elle annonce les quatre blocs.

          Effet de bord voulu : les fonds alternent désormais sans exception —
          Core teinté, Features clair, HowItWorks teinté, CTA clair. Journey et
          Features s'enchaînaient auparavant sur 2 338px du même fond, sans une
          seule respiration visuelle.
        */}
        <CoreSection />
        <FeaturesSection />
        <HowItWorksSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </>
  );
}
