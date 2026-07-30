/**
 * Tests de l'écran d'abonnement.
 *
 * L'écran lui-même n'affiche rien : il aiguille entre quatre états et délègue le
 * contenu à quatre cartes. C'est justement l'aiguillage qui mérite d'être tenu —
 * une erreur avalée afficherait une consommation vide, qu'on lirait comme « il
 * me reste tout mon quota » alors que le chiffre n'a simplement pas été chargé.
 *
 * L'historique de paiement est à part : lui seul a le droit d'arriver en retard,
 * puisqu'il n'entre dans aucune décision.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

type Q = { data?: unknown; isLoading: boolean; error?: unknown };

const state = vi.hoisted(() => ({
  subscription: { data: {}, isLoading: false } as Q,
  usage: { data: {}, isLoading: false } as Q,
  credits: { data: {}, isLoading: false } as Q,
  payments: { data: [], isLoading: false } as Q,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    subscription: {
      getSubscription: { useQuery: () => state.subscription },
      getUsage: { useQuery: () => state.usage },
      getCreditsUsage: { useQuery: () => state.credits },
      getPaymentHistory: { useQuery: () => state.payments },
    },
  },
}));

vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => null,
}));
vi.mock("./subscription-card", () => ({
  SubscriptionCard: () => <div>carte abonnement</div>,
}));
vi.mock("./usage-dashboard", () => ({
  UsageDashboard: () => <div>consommation</div>,
}));
vi.mock("./credits-usage-dashboard", () => ({
  CreditsUsageDashboard: () => <div>conversations</div>,
}));
vi.mock("./payment-history", () => ({
  PaymentHistory: ({ isLoading }: { isLoading: boolean }) => (
    <div>{isLoading ? "paiements en cours" : "paiements"}</div>
  ),
}));

import { SubscriptionContent } from "./subscription-content";

describe("SubscriptionContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.subscription = { data: {}, isLoading: false };
    state.usage = { data: {}, isLoading: false };
    state.credits = { data: {}, isLoading: false };
    state.payments = { data: [], isLoading: false };
  });

  it("affiche les quatre sections quand tout est chargé", () => {
    render(<SubscriptionContent />);

    expect(screen.getByText("carte abonnement")).toBeInTheDocument();
    expect(screen.getByText("consommation")).toBeInTheDocument();
    expect(screen.getByText("conversations")).toBeInTheDocument();
    expect(screen.getByText("paiements")).toBeInTheDocument();
  });

  /** Un chiffre partiel se lit comme un chiffre : mieux vaut ne rien montrer. */
  it.each(["subscription", "usage", "credits"] as const)(
    "n'affiche aucun chiffre tant que %s charge",
    (key) => {
      state[key] = { data: undefined, isLoading: true };
      render(<SubscriptionContent />);

      expect(screen.queryByText("consommation")).not.toBeInTheDocument();
      expect(screen.queryByText("conversations")).not.toBeInTheDocument();
    },
  );

  /**
   * Le pire cas : une erreur avalée laisserait la consommation à vide, qu'on
   * lirait comme « rien consommé » au lieu de « chiffre indisponible ».
   */
  it.each(["subscription", "usage", "credits"] as const)(
    "annonce l'erreur plutôt que d'afficher du vide quand %s échoue",
    (key) => {
      state[key] = { data: undefined, isLoading: false, error: new Error("boom") };
      render(<SubscriptionContent />);

      expect(screen.getByText(/Erreur lors du chargement/)).toBeInTheDocument();
      expect(screen.queryByText("consommation")).not.toBeInTheDocument();
    },
  );

  /**
   * L'historique n'entre dans aucune décision : il peut arriver après, sans
   * retenir le reste de l'écran.
   */
  it("montre déjà les chiffres pendant que l'historique charge encore", () => {
    state.payments = { data: undefined, isLoading: true };
    render(<SubscriptionContent />);

    expect(screen.getByText("consommation")).toBeInTheDocument();
    expect(screen.getByText("paiements en cours")).toBeInTheDocument();
  });
});
