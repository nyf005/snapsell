/**
 * L'écart entre une erreur connue et une erreur inattendue se joue ici.
 *
 * Une erreur connue dit déjà quoi faire : y coller une référence n'ajouterait
 * que du bruit. Une erreur inattendue laisse la vendeuse devant un message
 * générique, sans aucune issue — c'est là, et seulement là, qu'il lui faut de
 * quoi être aidée.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const state = vi.hoisted(() => ({ supportNumber: undefined as string | undefined }));

vi.mock("~/env", () => ({
  env: {
    get NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER() {
      return state.supportNumber;
    },
  },
}));

import { ErrorAlert } from "./error-alert";

describe("ErrorAlert", () => {
  beforeEach(() => {
    state.supportNumber = "2250701020304";
  });

  it("n'affiche rien sans erreur", () => {
    const { container } = render(<ErrorAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  /** Une erreur qui dit quoi faire n'a pas besoin d'un numéro de dossier. */
  it("ne montre pas de référence sur une erreur connue", () => {
    render(
      <ErrorAlert error={{ title: "Le nom est requis", detail: "Renseignez-le." }} />,
    );

    expect(screen.getByText("Le nom est requis")).toBeInTheDocument();
    expect(screen.queryByText(/Référence/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /contacter/ })).not.toBeInTheDocument();
  });

  it("montre la référence et le contact sur une erreur inattendue", () => {
    render(
      <ErrorAlert error={{ title: "Une erreur est survenue", reference: "A1B2C3" }} />,
    );

    expect(screen.getByText("A1B2C3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contacter/ })).toBeInTheDocument();
  });

  /** Elle sera recopiée depuis un écran de téléphone, ou dictée. */
  it("rend la référence sélectionnable d'un geste", () => {
    render(<ErrorAlert error={{ title: "Erreur", reference: "A1B2C3" }} />);

    expect(screen.getByText("A1B2C3")).toHaveClass("select-all");
  });

  it("emporte la référence dans le lien de contact", () => {
    render(<ErrorAlert error={{ title: "Erreur", reference: "A1B2C3" }} />);

    const href = screen.getByRole("link", { name: /contacter/ }).getAttribute("href")!;
    expect(href).toContain("wa.me/2250701020304");
    expect(decodeURIComponent(href)).toContain("A1B2C3");
  });

  /**
   * Le cas d'aujourd'hui : le numéro de support n'est pas encore acquis. La
   * référence reste affichée — elle vaut d'être notée — mais le lien mène au
   * centre d'aide plutôt qu'à `wa.me/undefined`.
   */
  it("renvoie au centre d'aide tant qu'aucun numéro n'est configuré", () => {
    state.supportNumber = undefined;
    render(<ErrorAlert error={{ title: "Erreur", reference: "A1B2C3" }} />);

    expect(screen.getByText("A1B2C3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contacter/ })).toHaveAttribute(
      "href",
      "/aide",
    );
  });

  /** Le lien WhatsApp quitte l'application : il ne doit pas emporter l'onglet. */
  it("ouvre le contact dans un nouvel onglet, sans fuite de référent", () => {
    render(<ErrorAlert error={{ title: "Erreur", reference: "A1B2C3" }} />);

    const link = screen.getByRole("link", { name: /contacter/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
