import { type Metadata } from "next";

import { LandingHeader } from "~/app/_components/landing/landing-header";
import { HeroSection } from "~/app/_components/landing/hero-section";
import { FeaturesSection } from "~/app/_components/landing/features-section";
import { HowItWorksSection } from "~/app/_components/landing/how-it-works-section";
import { CtaSection } from "~/app/_components/landing/cta-section";
import { LandingFooter } from "~/app/_components/landing/landing-footer";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  metadataBase: new URL("https://snapsell.app"),
  title: "SnapSell — Transformez vos lives en commandes structurées",
  description:
    "SnapSell automatise vos ventes WhatsApp : codes, réservations, file d'attente et acompte — tout est géré pour que vous puissiez vous concentrer sur la vente.",
  openGraph: {
    title: "SnapSell — Transformez vos lives en commandes structurées",
    description:
      "Automatisez vos ventes WhatsApp : codes, réservations, file d'attente et acompte — concentrez-vous sur la vente.",
    url: "https://snapsell.app",
    siteName: "SnapSell",
    type: "website",
    locale: "fr_FR",
    images: [{ url: "/logo.png", width: 500, height: 500, alt: "SnapSell" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SnapSell — Transformez vos lives en commandes structurées",
    description:
      "Automatisez vos ventes WhatsApp : codes, réservations, file d'attente et acompte.",
  },
};

export default async function Home() {
  const session = await auth();

  return (
    <>
      <LandingHeader user={session?.user ? { name: session.user.name, email: session.user.email! } : null} />
      <main id="main-content">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </>
  );
}
