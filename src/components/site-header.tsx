"use client";

import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Menu, User } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { SnapSellLogo } from "~/components/auth/snapsel-logo";

const navLinks = [
  { label: "Produit", href: "/#fonctionnalites" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Ressources", href: "#" },
] as const;

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

          {/* Desktop nav links */}
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

          {/* Right-side actions — context-dependent */}
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                {/* Logged-in on any page: user info + dashboard */}
                <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
                  <User className="size-4" />
                  {user.name ?? user.email.split("@")[0]}
                </span>
                <Button
                  asChild
                  className="rounded-lg font-bold shadow-lg shadow-primary/20"
                >
                  <Link href="/dashboard">
                    <LayoutDashboard className="mr-2 size-4" />
                    Tableau de bord
                  </Link>
                </Button>
              </>
            ) : isAuth ? (
              <>
                {/* On auth page (not logged in): back to home */}
                <Button
                  variant="ghost"
                  asChild
                  className="hidden gap-2 text-muted-foreground sm:inline-flex"
                >
                  <Link href="/">
                    <ArrowLeft className="size-4" />
                    Retour à l&apos;accueil
                  </Link>
                </Button>
              </>
            ) : (
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
                  <Link href="/login?tab=signup">Démarrer gratuitement</Link>
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

                <nav className="mt-8 flex flex-col gap-6 px-4">
                  {navLinks.map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="text-lg font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  ))}

                  <hr className="border-border" />

                  {isLoggedIn ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Connecté en tant que{" "}
                        <strong className="text-foreground">
                          {user.name ?? user.email.split("@")[0]}
                        </strong>
                      </p>
                      <Button asChild className="rounded-lg font-bold">
                        <Link href="/dashboard">
                          <LayoutDashboard className="mr-2 size-4" />
                          Tableau de bord
                        </Link>
                      </Button>
                    </>
                  ) : isAuth ? (
                    <Button asChild variant="outline" className="rounded-lg">
                      <Link href="/">
                        <ArrowLeft className="mr-2 size-4" />
                        Retour à l&apos;accueil
                      </Link>
                    </Button>
                  ) : (
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
                          Démarrer gratuitement
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
