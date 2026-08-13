/**
 * Tests de l'écran d'accueil.
 *
 * C'est le premier écran ouvert chaque matin. Il ne fait rien lui-même : il
 * décide quoi montrer. Les décisions qui comptent :
 *
 * 1. Tant que WhatsApp n'est pas connecté, aucun message ne peut arriver. Les
 *    compteurs valent zéro *par construction*, pas parce que la journée est
 *    calme — afficher le graphique d'activité à ce moment ferait croire à une
 *    boutique morte plutôt qu'à une boutique pas encore branchée.
 * 2. Un live déjà ouvert ne doit pas pouvoir en démarrer un second.
 * 3. Un échec au démarrage doit se voir : sans message, le bouton semble ne rien
 *    faire et la vendeuse reclique.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockPush = vi.hoisted(() => vi.fn());
const mockStartLive = vi.hoisted(() => vi.fn());

const state = vi.hoisted(() => ({
  summary: undefined as Record<string, unknown> | undefined,
  isLoading: false,
  setup: undefined as Record<string, unknown> | undefined,
  onError: undefined as ((e: unknown) => void) | undefined,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock("~/trpc/react", () => ({
  api: {
    dashboard: {
      getSummary: {
        useQuery: () => ({ data: state.summary, isLoading: state.isLoading }),
      },
    },
    onboarding: { getStatus: { useQuery: () => ({ data: state.setup }) } },
    live: {
      startLive: {
        useMutation: (opts?: { onError?: (e: unknown) => void }) => {
          state.onError = opts?.onError;
          return { mutateAsync: mockStartLive, isPending: false };
        },
      },
    },
  },
}));

vi.mock("~/app/(dashboard)/_components/credits-alert-banner", () => ({
  CreditsAlertBanner: () => null,
}));
vi.mock("~/app/(dashboard)/_components/assistant-control", () => ({
  AssistantControl: () => <div data-testid="assistant-control" />,
}));
vi.mock("./handed-off-conversations", () => ({
  HandedOffConversations: () => null,
}));

import { DashboardContent } from "./dashboard-content";

function summary(overrides: Record<string, unknown> = {}) {
  return {
    pendingProofsCount: 0,
    ordersPreparingCount: 0,
    hasLiveSession: false,
    lastProofSubmittedAt: null,
    revenueByDay: [],
    ...overrides,
  };
}

function setup(overrides: Record<string, unknown> = {}) {
  return {
    steps: [
      { id: "whatsapp", done: true, required: true },
      { id: "prices", done: true, required: true },
      { id: "delivery", done: true, required: true },
      { id: "assistant", done: true, required: true },
      { id: "replies", done: true, required: false },
      { id: "sellerPhone", done: true, required: false },
      { id: "firstSale", done: true, required: false },
    ],
    doneCount: 7,
    totalCount: 7,
    isComplete: true,
    whatsappConnected: true,
    ...overrides,
  };
}

function setupSteps(doneCount: number) {
  return (setup().steps as Array<{
    id: string;
    done: boolean;
    required: boolean;
  }>).map((step, index) => ({ ...step, done: index < doneCount }));
}

describe("DashboardContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.summary = summary();
    state.isLoading = false;
    state.setup = setup();
    state.onError = undefined;
    mockStartLive.mockResolvedValue(undefined);
  });

  function renderScreen() {
    return render(
      <DashboardContent showUpgradeBanner={false} canManageSubscription />,
    );
  }

  it("affiche les compteurs du jour", () => {
    state.summary = summary({ pendingProofsCount: 3, ordersPreparingCount: 7 });
    renderScreen();

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  describe("mise en route", () => {
    /** Une boutique déjà configurée n'a pas à revoir la liste chaque matin. */
    it("n'affiche pas la liste quand tout est fait", () => {
      renderScreen();

      expect(screen.queryByLabelText("Mise en route")).not.toBeInTheDocument();
    });

    it("affiche la liste tant qu'il reste une étape", () => {
      state.setup = setup({
        isComplete: false,
        doneCount: 5,
        steps: setupSteps(5),
      });
      renderScreen();

      expect(screen.getByLabelText("Mise en route")).toBeInTheDocument();
    });

    /**
     * Le point le plus subtil de l'écran. Sans WhatsApp, zéro n'est pas une
     * mauvaise journée : c'est l'absence de branchement. Le graphique d'activité
     * n'a alors rien à dire et laisse la place à la mise en route.
     */
    it("masque l'activité tant que WhatsApp n'est pas connecté", () => {
      state.setup = setup({
        isComplete: false,
        whatsappConnected: false,
        doneCount: 0,
        steps: setupSteps(0),
      });
      renderScreen();

      expect(screen.getByLabelText("Mise en route")).toBeInTheDocument();
      expect(screen.queryByText("Résultats du jour")).not.toBeInTheDocument();
    });

    it("affiche l'activité une fois WhatsApp connecté", () => {
      renderScreen();

      expect(screen.getByText("Résultats du jour")).toBeInTheDocument();
    });

    it("conserve le travail existant si WhatsApp se déconnecte", () => {
      state.setup = setup({
        isComplete: false,
        whatsappConnected: false,
        doneCount: 0,
        steps: setupSteps(0),
      });
      state.summary = summary({ pendingProofsCount: 2 });
      renderScreen();

      expect(
        screen.getByRole("heading", { name: "2 preuves à vérifier" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Mise en route")).toBeInTheDocument();
      expect(screen.queryByText("Résultats du jour")).not.toBeInTheDocument();
    });

    it("réduit la mise en route à un résumé quand le travail du jour est prioritaire", () => {
      state.setup = setup({
        isComplete: false,
        doneCount: 3,
        steps: setupSteps(3),
      });
      state.summary = summary({ ordersPreparingCount: 1 });
      renderScreen();

      expect(
        screen.getByRole("heading", { name: "1 commande à préparer" }),
      ).toBeInTheDocument();
      const setupRegion = screen.getByLabelText("Mise en route");
      expect(within(setupRegion).getByRole("link", { name: "Reprendre" })).toBeInTheDocument();
      expect(within(setupRegion).queryByText("Voir toutes les étapes")).not.toBeInTheDocument();
      expect(within(setupRegion).queryByText("Comprendre cette étape")).not.toBeInTheDocument();
    });
  });

  describe("live", () => {
    it("propose de démarrer un live quand aucun n'est ouvert", async () => {
      const user = userEvent.setup();
      renderScreen();

      await user.click(screen.getByRole("button", { name: /Démarrer/i }));

      expect(mockStartLive).toHaveBeenCalled();
    });

    /** Deux lives ouverts en parallèle, et les codes produits se télescopent. */
    it("mène au live en cours au lieu d'en démarrer un second", () => {
      state.summary = summary({ hasLiveSession: true });
      renderScreen();

      expect(screen.queryByRole("button", { name: /Démarrer/i })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Voir le live/i })).toHaveAttribute(
        "href",
        "/dashboard/live",
      );
    });

    /** Sans message, le bouton semble ne rien faire et on reclique. */
    it("montre l'échec du démarrage", async () => {
      renderScreen();

      state.onError?.({ message: "Impossible de démarrer" });

      expect(await screen.findByRole("alert")).toBeInTheDocument();
    });
  });

  it("n'affiche rien tant que le résumé n'est pas arrivé", () => {
    state.summary = undefined;
    const { container } = renderScreen();

    expect(container).toBeEmptyDOMElement();
  });
});
