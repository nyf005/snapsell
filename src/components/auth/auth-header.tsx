import Link from "next/link";

import { Button } from "~/components/ui/button";
import { SnapSellLogo } from "~/components/auth/snapsel-logo";

const navLinks = [
  { label: "Produit", href: "/#fonctionnalites" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Ressources", href: "#" },
] as const;

export function AuthHeader() {
  return (
    <header className="w-full border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <SnapSellLogo />
          <span className="text-xl font-extrabold tracking-tight">
            Snap<span className="text-primary">Sell</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Button
          asChild
          size="default"
          className="h-10 min-w-[84px] rounded-lg font-bold shadow-lg shadow-primary/20"
        >
          <Link href="/login">Connexion</Link>
        </Button>
      </div>
    </header>
  );
}
