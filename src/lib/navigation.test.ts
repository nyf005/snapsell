import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  navDescription,
  mobilePrimaryItems,
  mobileSheetItems,
  navItemsFor,
  NAV_ITEMS,
  NAV_SECTIONS,
  settingsItems,
} from "./navigation";

const APP_DIR = join(process.cwd(), "src", "app");

/**
 * Résout le fichier de page correspondant à une route.
 * Les routes du tableau de bord vivent sous le groupe `(dashboard)`.
 */
function pageExists(href: string): boolean {
  const segments = href.replace(/^\//, "");
  return (
    existsSync(join(APP_DIR, "(dashboard)", segments, "page.tsx")) ||
    existsSync(join(APP_DIR, segments, "page.tsx"))
  );
}

describe("NAV_ITEMS — chaque entrée pointe vers une page réelle", () => {
  it.each(NAV_ITEMS.map((i) => [i.href, i.label] as const))(
    "%s (%s) a un page.tsx",
    (href) => {
      expect(pageExists(href), `Aucune page pour ${href}`).toBe(true);
    },
  );
});

describe("NAV_ITEMS — cohérence", () => {
  it("aucun href n’est déclaré deux fois", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("aucun libellé n’est réutilisé pour deux routes", () => {
    // C'est la dérive historique : « Prix et paramètres » et « Grille de prix »
    // désignaient la même route selon la surface consultée.
    const labels = NAV_ITEMS.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("chaque entrée appartient à une section connue", () => {
    for (const item of NAV_ITEMS) {
      expect(NAV_SECTIONS).toContain(item.section);
    }
  });

  it("chaque entrée apparaît sur au moins une surface", () => {
    for (const item of NAV_ITEMS) {
      expect(item.surfaces.length, item.href).toBeGreaterThan(0);
    }
  });

  it("toute route /parametres est réservée aux managers", () => {
    for (const item of NAV_ITEMS.filter((i) => i.href.startsWith("/parametres"))) {
      expect(item.requiresGridRole, item.href).toBe(true);
    }
  });

  it("aucun libellé n’emploie de jargon technique", () => {
    const banned = /tenant|workspace|WABA|API|webhook|config\b/i;
    for (const item of NAV_ITEMS) {
      expect(banned.test(item.label), `${item.href} : ${item.label}`).toBe(false);
    }
  });
});

describe("Surfaces", () => {
  it("la barre mobile a exactement 3 destinations principales (4ᵉ = « Plus »)", () => {
    expect(mobilePrimaryItems()).toHaveLength(3);
  });

  it("les entrées principales du mobile sont aussi dans la barre latérale", () => {
    for (const item of mobilePrimaryItems()) {
      expect(item.surfaces).toContain("sidebar");
    }
  });

  it("aucune entrée mobile n’est absente de la barre latérale", () => {
    // `whatsapp-business` figurait dans la barre latérale mais pas dans la feuille mobile.
    const sidebar = new Set(navItemsFor("sidebar", true).map((i) => i.href));
    for (const item of navItemsFor("mobile", true)) {
      expect(sidebar.has(item.href), `${item.href} absente de la barre latérale`).toBe(true);
    }
  });

  it("un rôle sans droits de gestion ne voit aucune route /parametres", () => {
    for (const surface of ["sidebar", "mobile"] as const) {
      const hrefs = navItemsFor(surface, false).map((i) => i.href);
      expect(hrefs.some((h) => h.startsWith("/parametres"))).toBe(false);
    }
  });

  it("la feuille « Plus » exclut les destinations principales", () => {
    const primary = new Set(mobilePrimaryItems().map((i) => i.href));
    for (const item of mobileSheetItems(true)) {
      expect(primary.has(item.href)).toBe(false);
    }
  });

  it("chaque entrée de l’index des paramètres porte une description", () => {
    const items = settingsItems();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.description, item.href).toBeTruthy();
    }
  });

  it("l’index des paramètres ne se contient pas lui-même", () => {
    expect(settingsItems().map((i) => i.href)).not.toContain("/parametres");
  });
});

describe("Charge de la navigation", () => {
  /**
   * PRODUCT.md range parmi ses anti-références « les interfaces surchargées où chaque
   * capacité possède une entrée de navigation de même importance ». « Gérer » comptait
   * huit entrées à plat ; ces tests empêchent la section de regonfler.
   */
  it("« Gérer » tient en deux entrées dans la barre latérale", () => {
    const gerer = navItemsFor("sidebar", true).filter((i) => i.section === "Gérer");
    expect(gerer.map((i) => i.href)).toEqual(["/parametres", "/dashboard/audit"]);
  });

  it("la barre latérale reste sous dix entrées", () => {
    expect(navItemsFor("sidebar", true).length).toBeLessThanOrEqual(10);
  });

  it("les sous-pages de réglages ne s’affichent que dans l’index", () => {
    const subPages = NAV_ITEMS.filter(
      (i) => i.href.startsWith("/parametres/") && i.href !== "/parametres",
    );
    expect(subPages.length).toBeGreaterThan(0);
    for (const item of subPages) {
      expect(item.surfaces, item.href).toEqual(["settings"]);
    }
  });

  it("chaque sous-page de réglages reste atteignable par l’index", () => {
    // Retirer une entrée des menus ne doit jamais la rendre inaccessible.
    const inIndex = new Set(settingsItems().map((i) => i.href));
    const subPages = NAV_ITEMS.filter(
      (i) => i.href.startsWith("/parametres/") && i.href !== "/parametres",
    );
    for (const item of subPages) {
      expect(inIndex.has(item.href), `${item.href} injoignable`).toBe(true);
    }
  });

  it("la feuille « Plus » du mobile reste courte", () => {
    expect(mobileSheetItems(true).length).toBeLessThanOrEqual(5);
  });
});


describe("En-têtes d’écran — une seule source", () => {
  /**
   * Section, titre et description viennent de `NAV_ITEMS` via `TaskPageHeader href=`.
   *
   * Les trois avaient divergé du menu : « Prix » côté menu contre « Prix et
   * paramètres » côté page, des sections inventées (« Gérer · Vente »), et deux
   * descriptions contradictoires pour le même écran.
   */
  const SCREENS: Record<string, string> = {
    "/dashboard/live": "src/app/(dashboard)/dashboard/live/_components/live-ops-content.tsx",
    "/dashboard/orders":
      "src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx",
    "/dashboard/catalogue":
      "src/app/(dashboard)/dashboard/catalogue/_components/catalogue-list-content.tsx",
    "/dashboard/proofs":
      "src/app/(dashboard)/dashboard/proofs/_components/proofs-list-content.tsx",
    "/dashboard/audit":
      "src/app/(dashboard)/dashboard/audit/_components/audit-trail-content.tsx",
    "/parametres": "src/app/(dashboard)/parametres/_components/settings-index-content.tsx",
    "/parametres/prix": "src/app/(dashboard)/parametres/_components/pricing-grid-content.tsx",
    "/parametres/livraison":
      "src/app/(dashboard)/parametres/_components/delivery-fees-content.tsx",
    "/parametres/reponses":
      "src/app/(dashboard)/parametres/reponses/_components/auto-replies-content.tsx",
    "/parametres/whatsapp":
      "src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx",
    "/parametres/team": "src/app/(dashboard)/parametres/_components/team-content.tsx",
    "/parametres/abonnement":
      "src/app/(dashboard)/parametres/abonnement/_components/subscription-content.tsx",
  };

  it.each(Object.entries(SCREENS))("%s déclare son en-tête par href", (href, file) => {
    const source = readFileSync(file, "utf8");
    expect(source, `${file} doit passer href="${href}" à TaskPageHeader`).toContain(
      `href="${href}"`,
    );
  });

  it.each(Object.entries(SCREENS))("%s ne réécrit ni section ni titre", (_href, file) => {
    const source = readFileSync(file, "utf8");
    // `eyebrow` et `title` ont disparu de TaskPageHeader : les retrouver signifie
    // qu'une seconde source de vérité est réapparue.
    expect(/\beyebrow=/.test(source), `${file} : la section vient de NAV_ITEMS`).toBe(false);
    const headerBlock = source.slice(
      source.indexOf("<TaskPageHeader"),
      source.indexOf("/>", source.indexOf("<TaskPageHeader")),
    );
    expect(/\btitle=/.test(headerBlock), `${file} : le titre vient de NAV_ITEMS`).toBe(false);
  });

  it("navDescription refuse un écran sans description déclarée", () => {
    expect(() => navDescription("/route/inexistante")).toThrow();
  });

  it("chaque description dit ce que la personne obtient, pas ce que le logiciel fait", () => {
    const banned = /\bcomportement\b|\btraiter les opérations\b|\bdiagnostic\b|\bgérer votre inventaire\b/i;
    for (const item of NAV_ITEMS) {
      if (!item.description) continue;
      expect(banned.test(item.description), `${item.href} : « ${item.description} »`).toBe(
        false,
      );
    }
  });

  it("chaque section déclarée est l’une des quatre de DESIGN.md", () => {
    // « Gérer · Vente » et « Gérer · Communication » étaient inventées.
    for (const item of NAV_ITEMS) {
      expect(NAV_SECTIONS, item.href).toContain(item.section);
    }
  });
});
