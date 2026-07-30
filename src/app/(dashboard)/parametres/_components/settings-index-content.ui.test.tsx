/**
 * Tests du sommaire des paramètres.
 *
 * L'écran ne fait qu'une chose, mais la fait pour toute la configuration : dire
 * ce qui est réglé et ce qui ne l'est pas. Une pastille « Configuré » affichée à
 * tort renvoie la vendeuse en vente avec un WhatsApp non connecté.
 *
 * L'état inconnu compte autant que les deux autres : tant que la réponse n'est
 * pas arrivée, l'écran ne doit affirmer ni l'un ni l'autre.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";

const state = vi.hoisted(() => ({
  setup: undefined as
    | { steps: { id: string; done: boolean; required: boolean }[] }
    | undefined,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    onboarding: { getStatus: { useQuery: () => ({ data: state.setup }) } },
  },
}));

vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => null,
}));

import { settingsItems } from "~/lib/navigation";

import { SettingsIndexContent } from "./settings-index-content";

function steps(done: Record<string, boolean>) {
  return {
    steps: ["whatsapp", "prices", "delivery", "replies", "sellerPhone", "firstSale"].map(
      (id) => ({ id, done: done[id] ?? false, required: false }),
    ),
  };
}

/** Retrouve la carte d'une section par son libellé de navigation. */
function card(href: string) {
  const item = settingsItems().find((i) => i.href === href);
  if (!item) throw new Error(`section ${href} absente de la navigation`);
  return screen.getByRole("link", { name: new RegExp(item.label) });
}

describe("SettingsIndexContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.setup = undefined;
  });

  /** Le sommaire n'existait pas : les autres pages n'avaient aucune navigation frère. */
  it("mène à chaque page de paramètres", () => {
    state.setup = steps({});
    render(<SettingsIndexContent />);

    for (const item of settingsItems()) {
      expect(screen.getByRole("link", { name: new RegExp(item.label) })).toHaveAttribute(
        "href",
        item.href,
      );
    }
  });

  it.each([
    ["/parametres/whatsapp", "whatsapp"],
    ["/parametres/prix", "prices"],
    ["/parametres/livraison", "delivery"],
    ["/parametres/reponses", "replies"],
  ])("marque %s configuré quand son étape est faite", (href, stepId) => {
    state.setup = steps({ [stepId]: true });
    render(<SettingsIndexContent />);

    expect(within(card(href)).getByText("Configuré")).toBeInTheDocument();
  });

  it.each([
    ["/parametres/whatsapp", "whatsapp"],
    ["/parametres/prix", "prices"],
    ["/parametres/livraison", "delivery"],
    ["/parametres/reponses", "replies"],
  ])("marque %s à configurer quand son étape ne l'est pas", (href, stepId) => {
    state.setup = steps({ [stepId]: false });
    render(<SettingsIndexContent />);

    expect(within(card(href)).getByText("À configurer")).toBeInTheDocument();
  });

  /**
   * Tant que la réponse n'est pas là, l'écran ne sait pas — et « ne sait pas »
   * ne doit ressembler ni à « configuré » ni à « à configurer ».
   */
  it("n'affirme rien tant que l'état n'est pas connu", () => {
    render(<SettingsIndexContent />);

    expect(screen.queryByText("Configuré")).not.toBeInTheDocument();
    expect(screen.queryByText("À configurer")).not.toBeInTheDocument();
  });
});
