import Link from "next/link";

import { Button } from "~/components/ui/button";
import { SnapSellLogo } from "~/components/auth/snapsel-logo";

export function AuthHeader() {
  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-slate-200 dark:border-[#223649] px-6 py-4 md:px-10 bg-background">
      <div className="flex items-center gap-4">
        <SnapSellLogo />
        <h2 className="text-xl font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white">
          SnapSell
        </h2>
      </div>
      <div className="flex flex-1 justify-end gap-6 md:gap-8 items-center">
        <nav className="hidden md:flex items-center gap-9">
          <Link
            href="#"
            className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary transition-colors"
          >
            Produit
          </Link>
          <Link
            href="#"
            className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary transition-colors"
          >
            Tarifs
          </Link>
          <Link
            href="#"
            className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-primary transition-colors"
          >
            Ressources
          </Link>
        </nav>
        <Button
          asChild
          size="default"
          className="min-w-[84px] h-10 rounded-lg font-bold"
        >
          <Link href="/login">Connexion</Link>
        </Button>
      </div>
    </header>
  );
}
