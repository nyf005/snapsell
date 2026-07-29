import Link from "next/link";
import { marketing } from "~/lib/copy/marketing";
import { Globe, Share2, Mail } from "lucide-react";

import { SnapSellLogo } from "~/components/auth/snapsel-logo";
import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

/**
 * « Contact » et « Aide » pointaient sur `href: "#"` — un lien mort, alors que la
 * page tarifs promet une assistance et qu'aucune adresse n'apparaissait ailleurs
 * que dans les mentions légales. Les deux mènent désormais quelque part.
 */
const footerLinks = {
  produit: [
    { label: "Fonctionnalités", href: "#fonctionnalites" },
    { label: "Tarifs", href: "/tarifs" },
    { label: "Aide", href: "/aide" },
    { label: "Intégrations", href: "#" },
  ],
  entreprise: [
    { label: "À propos", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Recrutement", href: "#" },
    { label: "Contact", href: "mailto:contact@snapsell.app" },
  ],
  legal: [
    { label: "Confidentialité", href: "/politique-confidentialite" },
    { label: "Conditions", href: "/conditions-utilisation" },
    { label: "Cookies", href: "#" },
  ],
} as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card pt-20 pb-10">
      <div className="mx-auto max-w-7xl px-6">
        <AnimateOnScroll animation="fade-up">
          <div className="mb-16 grid grid-cols-2 gap-12 md:grid-cols-4">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="mb-6 flex items-center gap-2">
                <SnapSellLogo />
                <span className="text-xl font-extrabold tracking-tight">
                  Snap<span className="text-primary">Sell</span>
                </span>
              </div>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                La plateforme des boutiques qui vendent sur WhatsApp :
                catalogue, réservations, commandes et preuves de paiement au
                même endroit.
              </p>
              <div className="flex gap-4">
                <Link
                  href="#"
                  className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-primary"
                  aria-label="Site web"
                >
                  <Globe className="size-4" />
                </Link>
                <Link
                  href="#"
                  className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-primary"
                  aria-label="Partager"
                >
                  <Share2 className="size-4" />
                </Link>
                <Link
                  href="#"
                  className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-primary"
                  aria-label="Email"
                >
                  <Mail className="size-4" />
                </Link>
              </div>
            </div>

            {/* Product links */}
            <div>
              <h5 className="mb-6 font-bold">Produit</h5>
              <ul className="space-y-4 text-sm text-muted-foreground">
                {footerLinks.produit.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="transition-colors duration-200 hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company links */}
            <div>
              <h5 className="mb-6 font-bold">Entreprise</h5>
              <ul className="space-y-4 text-sm text-muted-foreground">
                {footerLinks.entreprise.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="transition-colors duration-200 hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal links */}
            <div>
              <h5 className="mb-6 font-bold">Légal</h5>
              <ul className="space-y-4 text-sm text-muted-foreground">
                {footerLinks.legal.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="transition-colors duration-200 hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AnimateOnScroll>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-xs text-muted-foreground md:flex-row">
          <p>{marketing.footer.copyright}</p>
          {/* La pastille « Systèmes opérationnels » clignotait sans qu'aucune page
              de statut ne la soutienne : retirée. */}
          <span>Conçu pour les boutiques d’Afrique de l’Ouest</span>
        </div>
      </div>
    </footer>
  );
}
