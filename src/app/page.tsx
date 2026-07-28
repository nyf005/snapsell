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
        <CoreSection />
        <FeaturesSection />
        <HowItWorksSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </>
  );
}
