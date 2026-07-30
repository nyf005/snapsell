import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";

import { SetupChecklist, STEP_META } from "./setup-checklist";
import { helpTopic } from "~/lib/copy";
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
    required: id === "whatsapp" || id === "prices" || id === "delivery",
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
  it("affiche les six étapes", () => {
    renderChecklist();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
  });

  it("met la connexion WhatsApp en premier", () => {
    renderChecklist();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Connecter WhatsApp");
  });

  it("pointe la connexion WhatsApp vers la bonne page", () => {
    renderChecklist();
    const link = screen.getByRole("link", { name: /Connecter WhatsApp/i });
    expect(link).toHaveAttribute("href", "/parametres/whatsapp");
  });

  it("distingue les étapes nécessaires des optionnelles", () => {
    renderChecklist();
    expect(screen.getAllByText("Nécessaire")).toHaveLength(3);
    expect(screen.getAllByText("Optionnel")).toHaveLength(3);
  });

  it("annonce la progression", () => {
    renderChecklist();
    expect(screen.getByText("0 étape sur 6 terminée")).toBeInTheDocument();
  });

  it("propose le catalogue comme alternative au live", () => {
    renderChecklist();
    const link = screen.getByRole("link", { name: /Ouvrir le catalogue/i });
    expect(link).toHaveAttribute("href", "/dashboard/catalogue");
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
    expect(screen.getAllByText("Terminé")).toHaveLength(1);
    expect(
      screen.queryByRole("link", { name: /^Connecter WhatsApp$/i }),
    ).not.toBeInTheDocument();
  });

  it("accorde le libellé de progression au pluriel", () => {
    renderChecklist(["whatsapp", "prices"]);
    expect(screen.getByText("2 étapes sur 6 terminées")).toBeInTheDocument();
  });

  it("disparaît complètement quand tout est fait", () => {
    const { container } = renderChecklist([...SETUP_STEP_IDS]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SetupChecklist — mode compact", () => {
  it("se réduit à une progression et à la prochaine étape", () => {
    renderChecklist(["whatsapp"], true);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText(/Prochaine étape : Définir vos prix/)).toBeInTheDocument();
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
