import { type Metadata } from "next";

import { SiteHeader } from "~/components/site-header";
import { LandingFooter } from "~/app/_components/landing/landing-footer";

export const metadata: Metadata = {
  title: "Conditions d'utilisation - SnapSell",
};

export default function ConditionsUtilisationPage() {
  return (
    <>
      <SiteHeader user={null} />
      <main className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="mb-10 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Conditions g&eacute;n&eacute;rales d&apos;utilisation
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Derni&egrave;re mise &agrave; jour&nbsp;: 13 f&eacute;vrier 2026
        </p>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">1. Objet</h2>
          <p className="leading-relaxed text-muted-foreground">
            Les pr&eacute;sentes conditions g&eacute;n&eacute;rales d&apos;utilisation (ci-apr&egrave;s &laquo;&nbsp;CGU&nbsp;&raquo;) ont pour objet de d&eacute;finir les modalit&eacute;s et conditions d&apos;utilisation de la plateforme SnapSell, accessible &agrave; l&apos;adresse snapsell.app (ci-apr&egrave;s la &laquo;&nbsp;Plateforme&nbsp;&raquo;).
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">2. Inscription</h2>
          <p className="leading-relaxed text-muted-foreground">
            L&apos;utilisation de la Plateforme n&eacute;cessite la cr&eacute;ation d&apos;un compte. L&apos;utilisateur s&apos;engage &agrave; fournir des informations exactes et &agrave; jour lors de son inscription. Il est responsable de la confidentialit&eacute; de ses identifiants de connexion et de toutes les actions effectu&eacute;es depuis son compte.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">3. Services</h2>
          <p className="leading-relaxed text-muted-foreground">
            SnapSell est une plateforme de gestion de catalogue, de ventes en live et de commandes via WhatsApp destin&eacute;e aux vendeurs. Elle permet notamment la cr&eacute;ation de catalogues produits, la gestion de sessions de vente en direct, le suivi des commandes et la g&eacute;n&eacute;ration de preuves de transaction.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">4. Obligations de l&apos;utilisateur</h2>
          <p className="leading-relaxed text-muted-foreground">
            L&apos;utilisateur s&apos;engage &agrave; utiliser la Plateforme conform&eacute;ment aux lois en vigueur et aux pr&eacute;sentes CGU. Il lui est interdit de&nbsp;: publier du contenu illicite, porter atteinte aux droits de tiers, tenter d&apos;acc&eacute;der de mani&egrave;re non autoris&eacute;e aux syst&egrave;mes de SnapSell, ou utiliser la Plateforme &agrave; des fins frauduleuses.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">5. Propri&eacute;t&eacute; intellectuelle</h2>
          <p className="leading-relaxed text-muted-foreground">
            L&apos;ensemble des &eacute;l&eacute;ments composant la Plateforme (textes, images, logos, logiciels, etc.) est prot&eacute;g&eacute; par le droit de la propri&eacute;t&eacute; intellectuelle. Toute reproduction, distribution ou utilisation non autoris&eacute;e de ces &eacute;l&eacute;ments est strictement interdite. Les contenus publi&eacute;s par les utilisateurs restent leur propri&eacute;t&eacute;, mais ils conc&egrave;dent &agrave; SnapSell une licence d&apos;utilisation n&eacute;cessaire au fonctionnement du service.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">6. Responsabilit&eacute;</h2>
          <p className="leading-relaxed text-muted-foreground">
            SnapSell met en &oelig;uvre les moyens raisonnables pour assurer le bon fonctionnement de la Plateforme. Toutefois, SnapSell ne saurait &ecirc;tre tenue responsable des dommages directs ou indirects r&eacute;sultant de l&apos;utilisation ou de l&apos;impossibilit&eacute; d&apos;utiliser la Plateforme, notamment en cas d&apos;interruption de service, de perte de donn&eacute;es ou de d&eacute;faillance technique.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">7. R&eacute;siliation</h2>
          <p className="leading-relaxed text-muted-foreground">
            L&apos;utilisateur peut r&eacute;silier son compte &agrave; tout moment depuis les param&egrave;tres de son espace. SnapSell se r&eacute;serve le droit de suspendre ou supprimer un compte en cas de manquement aux pr&eacute;sentes CGU, sans pr&eacute;avis ni indemnit&eacute;.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">8. Droit applicable</h2>
          <p className="leading-relaxed text-muted-foreground">
            Les pr&eacute;sentes CGU sont r&eacute;gies par le droit fran&ccedil;ais. En cas de litige, et apr&egrave;s tentative de r&eacute;solution amiable, les tribunaux comp&eacute;tents de Paris seront seuls comp&eacute;tents.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">9. Contact</h2>
          <p className="leading-relaxed text-muted-foreground">
            Pour toute question relative aux pr&eacute;sentes CGU, vous pouvez nous contacter &agrave; l&apos;adresse&nbsp;: contact@snapsell.app
          </p>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
