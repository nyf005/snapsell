/**
 * Source unique de la navigation.
 *
 * Le modèle de navigation était déclaré trois fois — barre latérale, barre mobile et
 * accordéon des paramètres — avec des libellés qui divergeaient (« Prix et paramètres »
 * d'un côté, « Grille de prix » de l'autre) et des entrées absentes d'une surface.
 * Tout part désormais d'ici, et `navigation.test.ts` échoue à la moindre dérive.
 */

import {
  CheckCircle2,
  CreditCard,
  HelpCircle,
  Home,
  MessageCircle,
  Package,
  PackageOpen,
  Radio,
  ScrollText,
  Settings,
  ShoppingCart,
  Tags,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Les quatre sections de l'IA définie dans DESIGN.md. */
export const NAV_SECTIONS = ["Aujourd’hui", "Vendre", "Traiter", "Gérer"] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

/** Surfaces où une entrée peut apparaître. */
export type NavSurface = "sidebar" | "mobile" | "settings";

export type NavItem = {
  href: string;
  /** Libellé unique — le même sur toutes les surfaces. */
  label: string;
  /** Phrase courte, affichée sur l'index des paramètres. */
  description?: string;
  icon: LucideIcon;
  section: NavSection;
  surfaces: readonly NavSurface[];
  /** Réservé aux rôles OWNER / MANAGER (`canManageGrid`). */
  requiresGridRole?: boolean;
  prefetch?: boolean;
  /** Occupe un emplacement de la barre mobile (4 max, grille `grid-cols-4`). */
  mobilePrimary?: boolean;
};

const ALL: readonly NavSurface[] = ["sidebar", "mobile"];

/**
 * Réglages accessibles **uniquement par l'index** `/parametres`.
 *
 * Les lister aussi dans la barre latérale gonflait la section « Gérer » à huit
 * entrées de même poids — exactement l'anti-référence de PRODUCT.md — et rendait
 * l'index inutile puisque personne n'avait besoin d'y passer.
 *
 * Les routes existent toujours et restent atteignables directement : seule leur
 * présence dans les menus change.
 */
const SETTINGS_ONLY: readonly NavSurface[] = ["settings"];

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Aujourd’hui",
    icon: Home,
    section: "Aujourd’hui",
    surfaces: ALL,
    prefetch: true,
    mobilePrimary: true,
  },
  {
    href: "/dashboard/live",
    label: "Live du moment",
    icon: Radio,
    section: "Vendre",
    surfaces: ALL,
    prefetch: true,
    mobilePrimary: true,
  },
  {
    href: "/dashboard/orders",
    label: "Commandes",
    icon: ShoppingCart,
    section: "Traiter",
    surfaces: ALL,
    prefetch: true,
    mobilePrimary: true,
  },
  {
    href: "/dashboard/catalogue",
    label: "Catalogue",
    icon: PackageOpen,
    section: "Vendre",
    surfaces: ALL,
    prefetch: true,
  },
  {
    href: "/dashboard/proofs",
    label: "Preuves de paiement",
    icon: CheckCircle2,
    section: "Traiter",
    surfaces: ALL,
    prefetch: true,
  },

  // ── Gérer ────────────────────────────────────────────────────────────────
  {
    href: "/parametres",
    label: "Paramètres",
    description: "Vos prix, vos frais de livraison, vos réponses automatiques.",
    icon: Settings,
    section: "Gérer",
    surfaces: ALL,
    requiresGridRole: true,
  },
  {
    href: "/parametres/prix",
    label: "Prix",
    description:
      "A12 prend le prix de la catégorie A. Définissez vos catégories une fois, elles s’appliquent à tous vos codes.",
    icon: Tags,
    section: "Gérer",
    surfaces: SETTINGS_ONLY,
    requiresGridRole: true,
  },
  {
    href: "/parametres/livraison",
    label: "Frais de livraison",
    description:
      "Le tarif ajouté au total, selon la commune où vous livrez.",
    icon: Package,
    section: "Gérer",
    surfaces: SETTINGS_ONLY,
    requiresGridRole: true,
  },
  {
    href: "/parametres/reponses",
    label: "Réponses automatiques",
    description: "Ce que l’assistant répond quand vous n’êtes pas disponible.",
    icon: HelpCircle,
    section: "Gérer",
    surfaces: SETTINGS_ONLY,
    requiresGridRole: true,
  },
  {
    href: "/parametres/whatsapp",
    label: "Connexion WhatsApp",
    description:
      "Le numéro qui reçoit les codes et envoie les confirmations.",
    icon: MessageCircle,
    section: "Gérer",
    surfaces: SETTINGS_ONLY,
    requiresGridRole: true,
  },
  {
    href: "/parametres/team",
    label: "Équipe",
    description:
      "Invitez des personnes pour vous aider à vendre pendant le live ou à préparer les commandes.",
    icon: Users,
    section: "Gérer",
    surfaces: SETTINGS_ONLY,
    requiresGridRole: true,
  },
  {
    href: "/parametres/abonnement",
    label: "Abonnement",
    description:
      "Changez de plan, achetez des conversations, consultez vos paiements.",
    icon: CreditCard,
    section: "Gérer",
    surfaces: SETTINGS_ONLY,
    requiresGridRole: true,
  },
  {
    href: "/dashboard/audit",
    label: "Historique de l’activité",
    description:
      "Tout ce qui s’est passé, du plus récent au plus ancien. Utile quand une commande est contestée.",
    icon: ScrollText,
    section: "Gérer",
    surfaces: ALL,
  },
];

/** Entrées visibles sur une surface, filtrées par rôle. */
export function navItemsFor(surface: NavSurface, canManageGrid: boolean): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      item.surfaces.includes(surface) && (!item.requiresGridRole || canManageGrid),
  );
}

/** Les trois destinations de la barre mobile (le 4ᵉ emplacement est « Plus »). */
export function mobilePrimaryItems(): NavItem[] {
  return NAV_ITEMS.filter((item) => item.mobilePrimary);
}

/** Entrées secondaires de la feuille « Plus ». */
export function mobileSheetItems(canManageGrid: boolean): NavItem[] {
  return navItemsFor("mobile", canManageGrid).filter((item) => !item.mobilePrimary);
}

/**
 * Description d'un écran — **source unique**.
 *
 * Elle était écrite deux fois : ici pour le menu, et dans le `TaskPageHeader` de la
 * page. Les deux avaient divergé (« Les personnes qui vous aident à vendre » contre
 * « Contrôlez qui peut accéder à la boutique et traiter les opérations »), exactement
 * comme les libellés avant que `navigation.test.ts` ne l'interdise.
 */
export function navDescription(href: string): string {
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (!item?.description) {
    throw new Error(`Aucune description déclarée pour ${href} dans NAV_ITEMS.`);
  }
  return item.description;
}

/** Entrées de l'index des paramètres, dans l'ordre d'affichage. */
export function settingsItems(): NavItem[] {
  return NAV_ITEMS.filter((item) => item.surfaces.includes("settings"));
}

/**
 * Racines des coquilles applicatives — celles qui portent une barre latérale ou
 * une barre mobile, et non un simple contenu de page.
 *
 * `/ops` n'apparaît pas dans `NAV_ITEMS` (console interne, hors navigation
 * boutique) : la liste est donc déclarée, pas dérivée.
 */
export const APP_SHELL_PREFIXES = ["/dashboard", "/parametres", "/ops"] as const;

/**
 * La route est-elle une coquille applicative ?
 *
 * Sert à `src/app/template.tsx`, qui doit exclure ces routes de l'animation
 * d'entrée de page. La raison est subtile et mérite d'être gardée par un test :
 * `page-in` anime `transform`, et une valeur de transform autre que `none` fait
 * de l'élément animé le bloc conteneur de ses descendants `position: fixed`.
 * Envelopper la coquille dans cet élément décrochait donc la barre mobile et la
 * barre latérale du viewport — mesuré, une sonde `fixed; bottom:0` atterrissait
 * à 6 200px au lieu du bas de l'écran.
 *
 * Si une nouvelle coquille apparaît sans être ajoutée ici, ses éléments fixes
 * seront silencieusement mal placés. D'où le test.
 */
export function isAppShellPath(pathname: string): boolean {
  return APP_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
