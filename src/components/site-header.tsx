"use client";

import Link from "next/link";
import { marketing } from "~/lib/copy/marketing";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { SnapSellLogo } from "~/components/auth/snapsel-logo";
import { cn, getInitials } from "~/lib/utils";

const accueilLink = { label: "Accueil", href: "/" } as const;
const tarificationLink = { label: "Tarifs", href: "/tarifs" } as const;

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export interface SiteHeaderUser {
  name?: string | null;
  email: string;
}

type HeaderVariant = "default" | "auth";

interface SiteHeaderProps {
  /** Pass user info from RSC auth() to show logged-in state */
  user?: SiteHeaderUser | null;
  /**
   * "default" — landing / public pages (full nav + CTA)
   * "auth"    — login / signup pages (nav links, back to home, no redundant CTA)
   */
  variant?: HeaderVariant;
}

export function SiteHeader({ user, variant = "default" }: SiteHeaderProps) {
  const pathname = usePathname();
  const isLoggedIn = !!user;
  const isAuth = variant === "auth";

  return (
    <>
      {/* Skip to content — WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-[100] focus-visible:rounded-lg focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-primary-foreground"
      >
        Aller au contenu principal
      </a>

      <header
        className={`w-full border-b border-border ${
          isAuth
            ? "bg-background"
            : "sticky top-0 z-50 bg-background/80 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <SnapSellLogo />
            <span className="text-xl font-extrabold tracking-tight">
              Snap<span className="text-primary">Sell</span>
            </span>
          </Link>

          {/* Right: Accueil, Tarification, then avatar or CTAs */}
          <div className="flex items-center gap-2">
            <Link
              href={accueilLink.href}
              aria-current={isNavActive(pathname, accueilLink.href) ? "page" : undefined}
              className={cn(
                "hidden rounded-md px-3 py-2 text-sm font-medium transition-colors md:inline-block",
                isNavActive(pathname, accueilLink.href)
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {accueilLink.label}
            </Link>
            <Link
              href={tarificationLink.href}
              aria-current={isNavActive(pathname, tarificationLink.href) ? "page" : undefined}
              className={cn(
                "hidden rounded-md px-3 py-2 text-sm font-medium transition-colors md:inline-block",
                isNavActive(pathname, tarificationLink.href)
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {tarificationLink.label}
            </Link>
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="flex shrink-0 rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Aller au tableau de bord"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{getInitials(user.name, user.email)}</AvatarFallback>
                </Avatar>
              </Link>
            ) : isAuth ? null : (
              <>
                {/* Public page (not logged in): login + signup */}
                <Button
                  variant="ghost"
                  asChild
                  className="hidden sm:inline-flex"
                >
                  <Link href="/login">Connexion</Link>
                </Button>
                <Button
                  asChild
                  className="hidden rounded-lg font-bold shadow-lg shadow-primary/20 sm:inline-flex"
                >
                  <Link href="/login?tab=signup">{marketing.cta.signup}</Link>
                </Button>
              </>
            )}

            {/* Mobile hamburger — visible < md */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Ouvrir le menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="sr-only">Menu de navigation</SheetTitle>

                <nav className="mt-8 flex flex-col gap-1 px-2">
                  <Link
                    href={accueilLink.href}
                    aria-current={isNavActive(pathname, accueilLink.href) ? "page" : undefined}
                    className={cn(
                      "rounded-lg px-4 py-3 text-base font-medium transition-colors",
                      isNavActive(pathname, accueilLink.href)
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    {accueilLink.label}
                  </Link>
                  <Link
                    href={tarificationLink.href}
                    aria-current={isNavActive(pathname, tarificationLink.href) ? "page" : undefined}
                    className={cn(
                      "rounded-lg px-4 py-3 text-base font-medium transition-colors",
                      isNavActive(pathname, tarificationLink.href)
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    {tarificationLink.label}
                  </Link>

                  <hr className="border-border" />

                  {isLoggedIn ? (
                    <Link
                      href="/dashboard"
                      className="flex shrink-0 rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label="Aller au tableau de bord"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {getInitials(user.name, user.email)}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                  ) : isAuth ? null : (
                    <>
                      <Button
                        asChild
                        variant="ghost"
                        className="justify-start"
                      >
                        <Link href="/login">Connexion</Link>
                      </Button>
                      <Button asChild className="rounded-lg font-bold">
                        <Link href="/login?tab=signup">
                          {marketing.cta.signup}
                        </Link>
                      </Button>
                    </>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
