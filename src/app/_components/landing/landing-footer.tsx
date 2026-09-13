import Link from "next/link";
import { marketing } from "~/lib/copy/marketing";
import { SnapSellLogo } from "~/components/auth/snapsel-logo";
const links = [
  { label: "Fonctionnalités", href: "/#fonctionnalites" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Aide", href: "/aide" },
  { label: "Contact", href: "mailto:contact@snapsell.app" },
  { label: "Confidentialité", href: "/politique-confidentialite" },
  { label: "Conditions", href: "/conditions-utilisation" },
];
export function LandingFooter() {
  return <footer className="border-t border-border bg-card px-5 py-8 sm:px-6"><div className="mx-auto max-w-6xl"><div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between"><Link href="/" className="inline-flex min-h-11 items-center gap-2 font-bold"><SnapSellLogo className="!size-8" />SnapSell</Link><nav aria-label="Liens du pied de page" className="flex flex-wrap gap-x-5 gap-y-1">{links.map((link) => <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline">{link.label}</Link>)}</nav></div><div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-border pt-5 text-xs text-muted-foreground"><p>{marketing.footer.copyright}</p><p>Conçu pour les boutiques d’Afrique de l’Ouest</p></div></div></footer>;
}
