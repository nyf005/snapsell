/**
 * La sortie du centre d'aide.
 *
 * 21 articles ne répondent jamais à tout. Sans ce bloc, une vendeuse qui ne
 * trouve pas sa réponse referme l'application, et personne n'apprend ce qui lui
 * manquait. Deux garanties : il apparaît quand un contact est possible, et il
 * disparaît quand il ne l'est pas — promettre un contact qui n'aboutit pas est
 * pire que ne rien promettre.
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

import { ContactSupport } from "./contact-support";

describe("ContactSupport", () => {
  beforeEach(() => {
    state.supportNumber = "2250701020304";
  });

  it("propose d'écrire quand un numéro est configuré", () => {
    render(<ContactSupport />);

    expect(
      screen.getByRole("link", { name: /Nous écrire sur WhatsApp/ }),
    ).toBeInTheDocument();
  });

  /** Le cas d'aujourd'hui : le numéro n'est pas encore acquis. */
  it("ne s'affiche pas tant qu'aucun numéro n'est configuré", () => {
    state.supportNumber = undefined;
    const { container } = render(<ContactSupport />);

    expect(container).toBeEmptyDOMElement();
  });

  it("emporte la boutique et la provenance dans le message", () => {
    render(<ContactSupport shopName="Chez Awa" />);

    const href = screen
      .getByRole("link", { name: /Nous écrire/ })
      .getAttribute("href")!;
    const text = decodeURIComponent(href);

    expect(text).toContain("wa.me/2250701020304");
    expect(text).toContain("Chez Awa");
    expect(text).toContain("/aide");
  });

  /** Le lien quitte l'application : il ne doit pas emporter l'onglet. */
  it("ouvre dans un nouvel onglet, sans fuite de référent", () => {
    render(<ContactSupport />);

    const link = screen.getByRole("link", { name: /Nous écrire/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
