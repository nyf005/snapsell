import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";

import { SetupChecklist, STEP_META } from "./setup-checklist";
import { helpTopic, ui } from "~/lib/copy";
import { SETUP_STEP_IDS } from "~/server/api/routers/onboarding.schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard",
}));

/** Fabrique un jeu d'étapes où seules celles listées sont terminées. */
function makeSteps(doneIds: string[] = []) {
  return SETUP_STEP_IDS.map((id) => ({
    id,
    done: doneIds.includes(id),
    required:
      id === "whatsapp" || id === "prices" || id === "delivery" || id === "assistant",
  }));
}

function renderChecklist(doneIds: string[] = [], compact = false) {
  const steps = makeSteps(doneIds);
  const doneCount = steps.filter((s) => s.done).length;
  return render(
    <SetupChecklist
      steps={steps}
      doneCount={doneCount}
      totalCount={steps.length}
      compact={compact}
    />,
  );
}

describe("SetupChecklist — compte neuf", () => {
  it("affiche une seule action principale et garde les huit étapes dans la vue d’ensemble", () => {
    renderChecklist();
    const list = screen.getByRole("list", { name: /Toutes les étapes/i });
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByRole("link", { name: /^Connecter WhatsApp$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Définir les prix$/i })).not.toBeInTheDocument();
  });

  /**
   * Le rail donne la position dans le parcours sans en exposer le contenu : six
   * étapes annoncées, aucune description ouverte en plus de celle du moment.
   */
  it("conserve le chemin complet dans la vue d’ensemble, sans ouvrir les huit étapes", () => {
    renderChecklist(["whatsapp", "prices"]);
    const rail = screen.getByRole("list", { name: "Toutes les étapes de la mise en route" });
    const stops = within(rail).getAllByRole("listitem");

    expect(stops).toHaveLength(8);
    expect(stops.filter((stop) => stop.getAttribute("aria-current") === "step"))
      .toHaveLength(1);
    // Seule l'étape du moment est décrite ; les autres ne le sont nulle part.
    expect(
      screen.queryByText(ui.setup.replies.description),
    ).not.toBeInTheDocument();
  });

  it("désigne l’étape du moment dans la vue d’ensemble", () => {
    renderChecklist(["whatsapp"]);
    const rail = screen.getByRole("list", { name: "Toutes les étapes de la mise en route" });
    const current = within(rail)
      .getAllByRole("listitem")
      .find((stop) => stop.getAttribute("aria-current") === "step");

    expect(current).toHaveTextContent("Définir vos prix par code");
    expect(current).toHaveTextContent("À faire en priorité");
  });

  it("dit l’état de chaque étape sans dépendre de la couleur", () => {
    renderChecklist(["whatsapp"]);
    const rail = screen.getByRole("list", { name: "Toutes les étapes de la mise en route" });

    expect(within(rail).getAllByText("Terminée")).toHaveLength(1);
    expect(within(rail).getAllByText("À venir")).toHaveLength(2);
  });

  it("met la connexion WhatsApp en premier", () => {
    renderChecklist();
    const list = screen.getByRole("list", { name: /Toutes les étapes/i });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Connecter WhatsApp");
  });

  it("pointe la connexion WhatsApp vers la bonne page", () => {
    renderChecklist();
    const link = screen.getByRole("link", { name: /Connecter WhatsApp/i });
    expect(link).toHaveAttribute("href", "/parametres/whatsapp");
  });

  it("présente l’étape courante comme nécessaire", () => {
    renderChecklist();
    expect(screen.getByRole("heading", { name: "Connecter WhatsApp" })).toBeInTheDocument();
    expect(screen.getAllByText("Recommandée")).toHaveLength(4);
  });

  /**
   * La barre conserve sa sémantique native ; le rail décrit séparément le chemin.
   */
  it("annonce la progression", () => {
    renderChecklist();
    expect(
      screen.getByLabelText("0 étape sur 8 terminée"),
    ).toBeInTheDocument();
    expect(screen.getByText("0/8 étapes")).toBeInTheDocument();
  });

  it("propose le catalogue quand la première vente devient l’étape courante", () => {
    renderChecklist(["whatsapp", "prices", "catalogue", "delivery", "assistant", "replies", "sellerPhone"]);
    const link = screen.getByRole("link", { name: /Ouvrir le catalogue/i });
    expect(link).toHaveAttribute("href", "/dashboard/catalogue");
  });

  it("explique le catalogue après la grille de prix et donne accès aux articles", () => {
    renderChecklist(["whatsapp", "prices"]);
    expect(screen.getByRole("heading", { name: ui.setup.catalogue.title })).toBeInTheDocument();
    expect(screen.getByText(ui.setup.catalogue.description)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ajouter un article" })).toHaveAttribute("href", "/dashboard/catalogue");
  });

  it("n’emploie aucun jargon technique", () => {
    const { container } = renderChecklist();
    const text = container.textContent ?? "";
    for (const banned of [
      "tenant",
      "WABA",
      "Access Token",
      "Phone Number ID",
      "webhook",
      "API",
      "workspace",
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("SetupChecklist — progression", () => {
  it("marque les étapes faites comme terminées et retire leur bouton", () => {
    renderChecklist(["whatsapp"]);
    expect(screen.getByText("Terminée")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Connecter WhatsApp$/i }),
    ).not.toBeInTheDocument();
  });

  it("accorde le libellé de progression au pluriel", () => {
    renderChecklist(["whatsapp", "prices"]);
    expect(
      screen.getByLabelText("2 étapes sur 8 terminées"),
    ).toBeInTheDocument();
  });

  it("disparaît complètement quand tout est fait", () => {
    const { container } = renderChecklist([...SETUP_STEP_IDS]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SetupChecklist — mode compact", () => {
  it("devient un résumé secondaire sans description et conserve l’accès aux étapes", () => {
    renderChecklist(["whatsapp"], true);
    expect(
      screen.getByRole("list", { name: "Toutes les étapes de la mise en route" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Définir vos prix par code" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ui.setup.prices.action })).toBeInTheDocument();
    expect(screen.queryByText(ui.setup.prices.description)).not.toBeInTheDocument();
    expect(screen.queryByText("Voir toutes les étapes")).not.toBeInTheDocument();
  });

  it("reste masqué si tout est fait, même en compact", () => {
    const { container } = renderChecklist([...SETUP_STEP_IDS], true);
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Chaque étape porte un `helpSlug` qui alimente le lien « Comprendre cette étape ».
 *
 * `help.test.ts` garde déjà les liens d'erreur de `errorCopy` de la même façon, mais
 * pas ceux-ci : renommer un slug dans `help.ts` cassait donc silencieusement six
 * liens. Le garde vit ici plutôt que dans `help.test.ts` parce que `STEP_META`
 * appartient à un composant client — ce fichier tourne déjà en jsdom et l'importe.
 */
describe("SetupChecklist — les articles rattachés existent", () => {
  it.each(SETUP_STEP_IDS)("l’étape %s pointe vers un article réel", (id) => {
    const slug = STEP_META[id].helpSlug;
    expect(helpTopic(slug), `${id} → ${slug}`).toBeDefined();
  });

  it("chaque étape déclare un article", () => {
    for (const id of SETUP_STEP_IDS) {
      expect(STEP_META[id].helpSlug, id).toBeTruthy();
    }
  });
});
