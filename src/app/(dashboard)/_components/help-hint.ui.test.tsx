import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { HelpHint } from "./help-hint";
import { TaskPageHeader } from "./task-page-header";
import { HELP_TOPICS, helpForRoute } from "~/lib/copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard/catalogue",
}));

describe("HelpHint", () => {
  it("n’affiche rien pour un slug inconnu", () => {
    const { container } = render(<HelpHint slug="article-inexistant" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ouvre le panneau et affiche l’article", async () => {
    const user = userEvent.setup();
    render(<HelpHint slug="creer-un-article" />);

    // Fermé au départ : le titre de l'article n'est pas là.
    expect(screen.queryByText("Créer un article dans le catalogue")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Comment ça marche/i }));

    expect(screen.getByText("Créer un article dans le catalogue")).toBeInTheDocument();
    // Une étape de la procédure, donc bien le corps et pas seulement l'en-tête.
    expect(screen.getByText(/Donnez le code que vous annoncerez/)).toBeInTheDocument();
  });

  it("propose l’article complet dans l’aide", async () => {
    const user = userEvent.setup();
    render(<HelpHint slug="creer-un-article" />);
    await user.click(screen.getByRole("button", { name: /Comment ça marche/i }));

    expect(
      screen.getByRole("link", { name: /Ouvrir cet article dans l’aide/ }),
    ).toHaveAttribute("href", "/aide/creer-un-article");
  });
});

describe("TaskPageHeader — l’aide est câblée par la route", () => {
  it("affiche le bouton d’aide de l’écran", () => {
    render(<TaskPageHeader href="/dashboard/catalogue" />);
    expect(screen.getByRole("button", { name: /Comment ça marche/i })).toBeInTheDocument();
  });

  it("help={false} retire le bouton", () => {
    render(<TaskPageHeader href="/dashboard/catalogue" help={false} />);
    expect(screen.queryByRole("button", { name: /Comment ça marche/i })).not.toBeInTheDocument();
  });

  it("un écran sans article rattaché n’affiche aucun bouton", () => {
    // `/dashboard/audit` est volontairement sans article : son contenu s'explique
    // depuis les articles qui y renvoient.
    expect(helpForRoute("/dashboard/audit")).toBeUndefined();
    render(<TaskPageHeader href="/dashboard/audit" />);
    expect(screen.queryByRole("button", { name: /Comment ça marche/i })).not.toBeInTheDocument();
  });

  it("chaque article rattaché à un écran s’ouvre depuis cet écran", () => {
    // Garde le câblage lui-même : si `helpForRoute` cessait d'être appelé, ce test
    // tomberait pour tous les écrans d'un coup.
    for (const topic of HELP_TOPICS.filter((t) => t.route)) {
      const { unmount } = render(<TaskPageHeader href={topic.route!} />);
      expect(
        screen.getByRole("button", { name: /Comment ça marche/i }),
        topic.route,
      ).toBeInTheDocument();
      unmount();
    }
  });
});
