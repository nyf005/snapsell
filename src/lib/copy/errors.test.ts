import { describe, expect, it } from "vitest";

import { formatError, formatErrorText } from "./errors";
import { errorCopy } from "./glossary";

/** Fabrique une erreur ayant la forme de celles que tRPC renvoie au client. */
function trpcError(opts: {
  message?: string;
  code?: string;
  userKey?: string | null;
  zodError?: unknown;
}) {
  return {
    message: opts.message ?? "",
    data: {
      code: opts.code ?? "INTERNAL_SERVER_ERROR",
      userKey: opts.userKey ?? null,
      zodError: opts.zodError ?? null,
    },
  };
}

describe("formatError — liste blanche par userKey", () => {
  it("utilise le texte enregistré quand la clé est connue", () => {
    const result = formatError(trpcError({ userKey: "whatsapp.notConnected" }));
    expect(result).toEqual(errorCopy["whatsapp.notConnected"]);
    expect(result.action?.href).toBe("/parametres/whatsapp");
  });

  it("ignore une clé inconnue et tombe sur le générique du contexte", () => {
    const result = formatError(
      trpcError({ userKey: "domaine.inexistant", message: "" }),
      "catalogue",
    );
    expect(result.title).toBe("L’article n’a pas pu être enregistré");
  });

  it("la clé prime sur le message serveur", () => {
    const result = formatError(
      trpcError({ userKey: "session.expired", message: "Un autre texte" }),
    );
    expect(result.title).toBe("Votre session a expiré");
  });
});

describe("formatError — aucune fuite technique", () => {
  const leaks = [
    "Internal server error",
    "Tenant abc123 introuvable, tenantId manquant",
    "Réservation invalide : aucun item associé (ni liveItemId ni catalogueItemId).",
    "Affinez les filtres (type, période, correlationId).",
    "Credentials WhatsApp invalides. Vérifie ton WABA ID et ton Access Token Meta.",
    "Configuration manquante: NEXT_PUBLIC_META_APP_ID est requis.",
    "Invalid `prisma.tenant.findUnique()` invocation",
    "Unique constraint failed (P2002)",
    "fetch failed",
    "connect ECONNREFUSED 127.0.0.1:5432",
    "<html><body>502 Bad Gateway</body></html>",
  ];

  it.each(leaks)("n’affiche jamais %j", (message) => {
    const result = formatError(trpcError({ message }));
    expect(result.title).not.toContain(message);
    expect(result.detail ?? "").not.toContain(message);
  });

  it("refuse un message trop long même s’il est propre", () => {
    const long = `${"Le prix est invalide. ".repeat(20)}`;
    const result = formatError(trpcError({ message: long }));
    expect(result.title).not.toBe(long);
    expect(result.title).toBe("Une erreur est survenue");
  });

  it("ne renvoie jamais de titre vide", () => {
    for (const err of [null, undefined, {}, new Error(""), "boom", 42]) {
      expect(formatError(err).title.length).toBeGreaterThan(0);
    }
  });
});

describe("formatError — messages serveur présentables", () => {
  it("laisse passer un message français propre", () => {
    const result = formatError(
      trpcError({
        message: "Le code A12 existe déjà dans votre catalogue.",
        code: "CONFLICT",
      }),
      "catalogue",
    );
    expect(result.title).toBe("Le code A12 existe déjà dans votre catalogue.");
  });
});

describe("formatError — codes tRPC", () => {
  it("UNAUTHORIZED propose de se reconnecter", () => {
    const result = formatError(trpcError({ code: "UNAUTHORIZED" }));
    expect(result.title).toBe("Votre session a expiré");
    expect(result.action?.href).toBe("/login");
  });

  it("FORBIDDEN explique la restriction", () => {
    const result = formatError(trpcError({ code: "FORBIDDEN" }));
    expect(result.title).toBe("Action réservée");
  });

  it("TOO_MANY_REQUESTS invite à patienter", () => {
    const result = formatError(trpcError({ code: "TOO_MANY_REQUESTS" }));
    expect(result.detail).toContain("Patientez");
  });

  it("INTERNAL_SERVER_ERROR utilise le générique du contexte", () => {
    expect(formatError(trpcError({ code: "INTERNAL_SERVER_ERROR" }), "delivery").title).toBe(
      "Les frais de livraison n’ont pas pu être enregistrés",
    );
    expect(formatError(trpcError({ code: "INTERNAL_SERVER_ERROR" }), "team").title).toBe(
      "L’équipe n’a pas pu être mise à jour",
    );
  });
});

describe("formatError — validation Zod", () => {
  it("traduit le premier champ en erreur", () => {
    const result = formatError(
      trpcError({
        code: "BAD_REQUEST",
        zodError: { formErrors: [], fieldErrors: { code: ["Le code est requis"] } },
      }),
    );
    expect(result.title).toBe("Vérifiez votre saisie");
    expect(result.detail).toBe("Le code : le code est requis");
  });

  it("retombe sur un libellé générique pour un champ inconnu", () => {
    const result = formatError(
      trpcError({
        code: "BAD_REQUEST",
        zodError: { formErrors: [], fieldErrors: { mysteryField: [] } },
      }),
    );
    expect(result.detail).toBe("Ce champ n’est pas valide.");
  });
});

describe("formatErrorText", () => {
  it("assemble titre et détail sur une ligne", () => {
    expect(formatErrorText(trpcError({ userKey: "session.expired" }))).toBe(
      "Votre session a expiré. Reconnectez-vous pour continuer.",
    );
  });

  it("n’ajoute pas de point superflu sans détail", () => {
    expect(formatErrorText(trpcError({ userKey: "team.alreadyMember" }))).toBe(
      "Cette personne fait déjà partie de l’équipe",
    );
  });
});

describe("errorCopy — cohérence du registre", () => {
  it("chaque entrée a un titre non vide", () => {
    for (const [key, value] of Object.entries(errorCopy)) {
      expect(value.title, key).toBeTruthy();
    }
  });

  it("aucune entrée ne contient de jargon technique", () => {
    const banned = /tenant|workspace|WABA|Access Token|Phone Number ID|NEXT_PUBLIC_|webhook|payload/i;
    for (const [key, value] of Object.entries(errorCopy)) {
      const text = `${value.title} ${value.detail ?? ""}`;
      expect(banned.test(text), `${key} contient du jargon : ${text}`).toBe(false);
    }
  });

  it("chaque action pointe vers un chemin interne", () => {
    for (const [key, value] of Object.entries(errorCopy)) {
      if (value.action) {
        expect(value.action.href.startsWith("/"), key).toBe(true);
        expect(value.action.label.length, key).toBeGreaterThan(0);
      }
    }
  });
});
