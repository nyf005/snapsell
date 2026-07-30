/**
 * Tests des réponses automatiques.
 *
 * Ce que la vendeuse tape ici part textuellement à ses clientes, sans qu'elle
 * relise. Le contrat à tenir tient en deux points :
 *
 * 1. Une réponse vidée doit être *effacée*, pas laissée telle quelle. L'écran
 *    envoie `null` pour un champ vide — c'est ce qui éteint la réponse. Envoyer
 *    `""` ou omettre le champ laisserait l'ancienne réponse partir encore.
 * 2. Ce qui est en base doit remplir le formulaire, sinon un simple
 *    enregistrement écrase les trois autres réponses avec du vide.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockSave = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  faq: null as Record<string, string | null> | null,
  isLoading: false,
  isPending: false,
  isSuccess: false,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ settings: { getFaqSettings: { invalidate: vi.fn() } } }),
    settings: {
      getFaqSettings: {
        useQuery: () => ({ data: state.faq, isLoading: state.isLoading }),
      },
      setFaqSettings: {
        useMutation: () => ({
          mutate: mockSave,
          isPending: state.isPending,
          isError: false,
          isSuccess: state.isSuccess,
          error: null,
        }),
      },
    },
  },
}));

vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => null,
}));
vi.mock("~/app/(dashboard)/parametres/_components/business-hours-card", () => ({
  BusinessHoursCard: () => null,
}));

import { AutoRepliesContent } from "./auto-replies-content";

describe("AutoRepliesContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.faq = {
      faqDelivery: null,
      faqPayment: null,
      faqLocation: null,
      faqAvailability: null,
    };
    state.isLoading = false;
    state.isPending = false;
    state.isSuccess = false;
  });

  const save = () => screen.getByRole("button", { name: /Enregistrer/ });

  it("propose les quatre réponses", () => {
    render(<AutoRepliesContent />);

    for (const label of ["Livraison", "Paiement", "Localisation", "Disponibilité"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  /** Sans ça, enregistrer une seule réponse effacerait les trois autres. */
  it("remplit le formulaire avec ce qui est déjà enregistré", () => {
    state.faq = {
      faqDelivery: "Sous 24h dans Abidjan",
      faqPayment: "Wave et Orange Money",
      faqLocation: null,
      faqAvailability: null,
    };
    render(<AutoRepliesContent />);

    expect(screen.getByLabelText("Livraison")).toHaveValue("Sous 24h dans Abidjan");
    expect(screen.getByLabelText("Paiement")).toHaveValue("Wave et Orange Money");
    expect(screen.getByLabelText("Localisation")).toHaveValue("");
  });

  it("envoie la réponse saisie", async () => {
    const user = userEvent.setup();
    render(<AutoRepliesContent />);

    await user.type(screen.getByLabelText("Livraison"), "Sous 24h dans Abidjan");
    await user.click(save());

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ faqDelivery: "Sous 24h dans Abidjan" }),
    );
  });

  /**
   * Le point qui compte : vider un champ doit éteindre la réponse. `null` est
   * ce que le serveur comprend comme « ne réponds plus rien ».
   */
  it("éteint une réponse qu'on vide, au lieu de la laisser partir", async () => {
    const user = userEvent.setup();
    state.faq = {
      faqDelivery: "Sous 24h",
      faqPayment: null,
      faqLocation: null,
      faqAvailability: null,
    };
    render(<AutoRepliesContent />);

    await user.clear(screen.getByLabelText("Livraison"));
    await user.click(save());

    expect(mockSave).toHaveBeenCalledWith({
      faqDelivery: null,
      faqPayment: null,
      faqLocation: null,
      faqAvailability: null,
    });
  });

  /** Le serveur plafonne à 1000 caractères ; le champ doit s'y tenir aussi. */
  it("borne chaque réponse à 1000 caractères", () => {
    render(<AutoRepliesContent />);

    for (const label of ["Livraison", "Paiement", "Localisation", "Disponibilité"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("maxlength", "1000");
    }
  });

  it("confirme l'enregistrement", () => {
    state.isSuccess = true;
    render(<AutoRepliesContent />);

    expect(screen.getByText("Vos réponses sont enregistrées.")).toBeInTheDocument();
  });

  /** Deux clics de suite ne doivent pas envoyer deux fois. */
  it("bloque le bouton pendant l'enregistrement", () => {
    state.isPending = true;
    render(<AutoRepliesContent />);

    expect(save()).toBeDisabled();
  });
});
