import { type Metadata } from "next";

import { SiteHeader } from "~/components/site-header";
import { LandingFooter } from "~/app/_components/landing/landing-footer";

export const metadata: Metadata = {
  title: "Politique de confidentialité - SnapSell",
};

export default function PolitiqueConfidentialitePage() {
  return (
    <>
      <SiteHeader user={null} />
      <main className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="mb-10 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Politique de confidentialit&eacute;
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Derni&egrave;re mise &agrave; jour&nbsp;: 13 f&eacute;vrier 2026
        </p>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">1. Donn&eacute;es collect&eacute;es</h2>
          <p className="leading-relaxed text-muted-foreground">
            Dans le cadre de l&apos;utilisation de la plateforme SnapSell, nous collectons les donn&eacute;es suivantes&nbsp;: nom, pr&eacute;nom, adresse e-mail, num&eacute;ro de t&eacute;l&eacute;phone WhatsApp, informations relatives aux transactions (commandes, paiements), ainsi que des donn&eacute;es techniques de navigation (adresse IP, type de navigateur, pages visit&eacute;es).
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">2. Finalit&eacute;s du traitement</h2>
          <p className="leading-relaxed text-muted-foreground">
            Vos donn&eacute;es sont trait&eacute;es pour les finalit&eacute;s suivantes&nbsp;: cr&eacute;ation et gestion de votre compte, fourniture et am&eacute;lioration des services de la Plateforme, traitement et suivi des commandes, envoi de notifications li&eacute;es &agrave; votre activit&eacute;, analyses statistiques et am&eacute;lioration de l&apos;exp&eacute;rience utilisateur.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">3. Base l&eacute;gale</h2>
          <p className="leading-relaxed text-muted-foreground">
            Le traitement de vos donn&eacute;es repose sur&nbsp;: l&apos;ex&eacute;cution du contrat liant l&apos;utilisateur &agrave; SnapSell, votre consentement (notamment pour les cookies non essentiels), et notre int&eacute;r&ecirc;t l&eacute;gitime (s&eacute;curit&eacute; de la Plateforme, pr&eacute;vention de la fraude, am&eacute;lioration du service).
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">4. Partage des donn&eacute;es</h2>
          <p className="leading-relaxed text-muted-foreground">
            Vos donn&eacute;es personnelles ne sont pas vendues &agrave; des tiers. Elles peuvent &ecirc;tre partag&eacute;es avec&nbsp;: nos prestataires techniques (h&eacute;bergement, paiement via Paystack, envoi de messages via WhatsApp Business API), les autorit&eacute;s comp&eacute;tentes en cas d&apos;obligation l&eacute;gale.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">5. Conservation</h2>
          <p className="leading-relaxed text-muted-foreground">
            Vos donn&eacute;es sont conserv&eacute;es pendant la dur&eacute;e de votre utilisation de la Plateforme, puis pendant une dur&eacute;e maximale de 3 ans apr&egrave;s la suppression de votre compte, sauf obligation l&eacute;gale de conservation plus longue.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">6. Droits des utilisateurs</h2>
          <p className="leading-relaxed text-muted-foreground">
            Conform&eacute;ment au R&egrave;glement G&eacute;n&eacute;ral sur la Protection des Donn&eacute;es (RGPD), vous disposez des droits suivants&nbsp;: droit d&apos;acc&egrave;s, de rectification, de suppression, de limitation du traitement, de portabilit&eacute; de vos donn&eacute;es, et d&apos;opposition au traitement. Pour exercer ces droits, contactez-nous &agrave; l&apos;adresse&nbsp;: contact@snapsell.app
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">7. Cookies</h2>
          <p className="leading-relaxed text-muted-foreground">
            La Plateforme utilise des cookies strictement n&eacute;cessaires au fonctionnement du service (authentification, pr&eacute;f&eacute;rences de session). Des cookies d&apos;analyse peuvent &ecirc;tre utilis&eacute;s pour am&eacute;liorer l&apos;exp&eacute;rience utilisateur, sous r&eacute;serve de votre consentement.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">8. Contact</h2>
          <p className="leading-relaxed text-muted-foreground">
            Pour toute question relative &agrave; la protection de vos donn&eacute;es personnelles, vous pouvez nous contacter &agrave; l&apos;adresse&nbsp;: contact@snapsell.app
          </p>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
