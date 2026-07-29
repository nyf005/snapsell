import { describe, expect, it } from "vitest";

import {
  HELP_FAMILIES,
  HELP_TOPICS,
  helpForRoute,
  helpTopic,
  helpTopicsByFamily,
  helpTopicsFor,
  type HelpRole,
} from "./help";
import { errorCopy } from "./glossary";
import { NAV_ITEMS } from "~/lib/navigation";

/**
 * Garde-fou de l'aide.
 *
 * Le vocabulaire est déjà couvert par `vocabulary.guard.test.ts`, qui aplatit
 * `HELP_TOPICS` avec le reste des textes affichés. Ici, on garde la **structure** :
 * les liens tiennent, et surtout l'aide ne prend pas de retard sur le produit.
 */

const SLUGS = new Set(HELP_TOPICS.map((t) => t.slug));
const NAV_HREFS = new Set(NAV_ITEMS.map((i) => i.href));
const ROLES: readonly HelpRole[] = ["OWNER", "MANAGER", "AGENT"];

describe("HELP_TOPICS — cohérence", () => {
  it("aucun slug n’est déclaré deux fois", () => {
    expect(SLUGS.size).toBe(HELP_TOPICS.length);
  });

  it("les slugs tiennent dans une adresse", () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.slug, topic.title).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("chaque article appartient à une famille déclarée", () => {
    const families = new Set(HELP_FAMILIES.map((f) => f.id));
    for (const topic of HELP_TOPICS) {
      expect(families.has(topic.family), topic.slug).toBe(true);
    }
  });

  it("aucune famille n’est vide", () => {
    for (const { family, topics } of helpTopicsByFamily()) {
      expect(topics.length, family.id).toBeGreaterThan(0);
    }
  });

  it("chaque article porte un titre, une question et un corps", () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.title.length, topic.slug).toBeGreaterThan(0);
      expect(topic.question.length, topic.slug).toBeGreaterThan(0);
      expect(topic.body.length, topic.slug).toBeGreaterThan(0);
    }
  });

  it("chaque résumé reste lisible d’un coup d’œil", () => {
    // Le résumé sert l'index, le panneau contextuel et les résultats de recherche :
    // au-delà de 200 caractères il déborde de tous les trois.
    for (const topic of HELP_TOPICS) {
      expect(topic.summary.length, `${topic.slug} : ${topic.summary.length}`)
        .toBeLessThanOrEqual(200);
    }
  });

  it("les rôles déclarés existent", () => {
    for (const topic of HELP_TOPICS) {
      for (const role of topic.roles ?? []) {
        expect(ROLES, topic.slug).toContain(role);
      }
    }
  });
});

describe("HELP_TOPICS — les liens tiennent", () => {
  it("chaque « related » pointe vers un article réel", () => {
    for (const topic of HELP_TOPICS) {
      for (const slug of topic.related ?? []) {
        expect(SLUGS.has(slug), `${topic.slug} → ${slug}`).toBe(true);
      }
    }
  });

  it("aucun article ne se cite lui-même", () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.related ?? [], topic.slug).not.toContain(topic.slug);
    }
  });

  it("chaque « route » est une route déclarée dans NAV_ITEMS", () => {
    // NAV_ITEMS garantit de son côté qu'un href a bien un page.tsx.
    for (const topic of HELP_TOPICS) {
      if (topic.route) {
        expect(NAV_HREFS.has(topic.route), `${topic.slug} → ${topic.route}`).toBe(true);
      }
    }
  });

  it("aucun écran n’a deux articles rattachés", () => {
    // `helpForRoute` renvoie le premier trouvé : deux articles pour un écran, et
    // l'aide contextuelle en affiche un au hasard de l'ordre du tableau.
    const routes = HELP_TOPICS.map((t) => t.route).filter(Boolean);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("chaque erreur qui renvoie vers l’aide pointe vers un article réel", () => {
    // Un message d'erreur avec un lien mort est pire que sans lien : la personne
    // est bloquée et le seul recours proposé tombe sur une page introuvable.
    for (const [key, copy] of Object.entries(errorCopy)) {
      const href = copy.action?.href;
      if (!href?.startsWith("/aide/")) continue;
      const slug = href.slice("/aide/".length);
      expect(SLUGS.has(slug), `${key} → ${href}`).toBe(true);
    }
  });

  it("chaque bloc « screen » pointe vers une route réelle", () => {
    for (const topic of HELP_TOPICS) {
      for (const block of topic.body) {
        if (block.kind === "screen") {
          expect(NAV_HREFS.has(block.href), `${topic.slug} → ${block.href}`).toBe(true);
        }
      }
    }
  });
});

describe("HELP_TOPICS — l’aide suit le produit", () => {
  /**
   * LE test de ce fichier.
   *
   * Ajouter un écran de tâche sans l'expliquer fait échouer la suite. Sans lui,
   * l'aide serait exacte le jour de son écriture et fausse trois mois plus tard —
   * le sort habituel des pages d'aide.
   *
   * Les sous-pages de réglages sont exclues : elles sont regroupées dans des
   * articles transverses (les prix ET la livraison dans « prix-et-livraison »),
   * ce qui est plus lisible qu'un article par formulaire.
   */
  const TASK_SCREENS = NAV_ITEMS.filter(
    (i) => i.href.startsWith("/dashboard") && i.href !== "/dashboard/audit",
  );

  it.each(TASK_SCREENS.map((i) => [i.href, i.label] as const))(
    "%s (%s) a un article rattaché",
    (href) => {
      expect(helpForRoute(href), `Aucun article ne déclare route: "${href}"`).toBeDefined();
    },
  );
});

describe("Registre — les extraits de conversation citent le robot", () => {
  it("aucun tour d’assistant ne vouvoie", () => {
    // Le robot tutoie la personne qui achète (glossary.ts). Un extrait qui vouvoie
    // enseignerait un produit qui n'existe pas.
    const offenders: string[] = [];
    for (const topic of HELP_TOPICS) {
      for (const block of topic.body) {
        if (block.kind !== "chat") continue;
        for (const turn of block.turns) {
          if (/\b(vous|votre|vos)\b/i.test(turn.text)) {
            offenders.push(`${topic.slug} → « ${turn.text} »`);
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("Accesseurs", () => {
  it("helpTopic trouve par slug et renvoie undefined sinon", () => {
    expect(helpTopic("le-code")?.title).toBeDefined();
    expect(helpTopic("article-qui-nexiste-pas")).toBeUndefined();
  });

  it("helpForRoute rattache l’article à son écran", () => {
    expect(helpForRoute("/dashboard/catalogue")?.slug).toBe("creer-un-article");
    expect(helpForRoute("/route/inconnue")).toBeUndefined();
  });

  it("un rôle sans droits de gestion ne reçoit pas les articles de réglages", () => {
    const agent = helpTopicsFor("AGENT").map((t) => t.slug);
    expect(agent).not.toContain("prix-et-livraison");
    // L'Agent tient le live : `tenir-un-live` doit lui rester accessible.
    expect(agent).toContain("tenir-un-live");
  });

  it("un propriétaire reçoit tout", () => {
    expect(helpTopicsFor("OWNER")).toHaveLength(HELP_TOPICS.length);
  });

  it("sans session, rien n’est filtré — la page est publique", () => {
    expect(helpTopicsFor(null)).toHaveLength(HELP_TOPICS.length);
    expect(helpTopicsFor(undefined)).toHaveLength(HELP_TOPICS.length);
  });

  it("helpTopicsByFamily respecte l’ordre déclaré", () => {
    expect(helpTopicsByFamily().map((g) => g.family.id)).toEqual(
      HELP_FAMILIES.map((f) => f.id),
    );
  });
});
