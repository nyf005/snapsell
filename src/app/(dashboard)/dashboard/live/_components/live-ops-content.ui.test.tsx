import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard/live",
}));

// Mock DashboardHeader
vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));
vi.mock("~/app/(dashboard)/_components/assistant-control", () => ({
  AssistantControl: () => <div data-testid="assistant-control" />,
}));

const mockStartLive = vi.fn();
const mockEndLive = vi.fn();
const mockReleaseReservation = vi.fn();
const mockAddFromCatalogue = vi.fn();

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      live: { getLiveOpsData: { invalidate: vi.fn() } },
      assistant: { getStatus: { invalidate: vi.fn() } },
      catalogue: { list: { invalidate: vi.fn() } },
    }),
    // Le dialogue « Depuis le catalogue » branche `live.addItemFromCatalogue`,
    // procédure qui existait sans appelant.
    catalogue: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              { id: "cat-1", code: "A12", amount: 500000, availableQty: 3 },
              { id: "cat-2", code: "B7", amount: null, availableQty: 0 },
            ],
            nextCursor: null,
          },
          isLoading: false,
        }),
      },
    },
    // Consommé par SetupRequiredBanner ; boutique connectée → bandeau masqué.
    onboarding: {
      getStatus: {
        useQuery: () => ({ data: { whatsappConnected: true }, isLoading: false }),
      },
    },
    assistant: {
      getStatus: {
        useQuery: () => ({ data: { state: "active", enabled: true } }),
      },
      setEnabled: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
    live: {
      getLiveOpsData: {
        useQuery: () => ({
          data: {
            session: { id: "session-1", startedAt: new Date() },
            items: [
              {
                id: "li-1",
                code: "A1",
                amount: 5000,
                quantity: 5,
                availableQty: 3,
                reservedQty: 2,
              },
              {
                id: "li-2",
                code: "B2",
                amount: null,
                quantity: 2,
                availableQty: 0,
                reservedQty: 2,
              },
            ],
            reservations: [
              {
                id: "res-1",
                code: "A1",
                clientPhoneMasked: "** ** 03 04",
                status: "reserved",
                expiresAt: new Date(Date.now() + 600_000),
              },
            ],
            waitlistCount: 3,
          },
          isLoading: false,
        }),
      },
      startLive: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockStartLive.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
        }),
      },
      endLive: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockEndLive.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
        }),
      },
      releaseReservation: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockReleaseReservation.mockImplementation(() =>
            opts.onSuccess?.(),
          ),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      addItemFromCatalogue: {
        useMutation: (opts: { onSuccess?: (item: { code: string }) => void }) => ({
          mutate: mockAddFromCatalogue.mockImplementation(() =>
            opts.onSuccess?.({ code: "A12" }),
          ),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

import { LiveOpsContent } from "./live-ops-content";

describe("LiveOpsContent — active session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page title", () => {
    render(<LiveOpsContent />);
    expect(screen.getByRole("heading", { name: "Live du moment" })).toBeInTheDocument();
  });

  it("shows item codes in the inventory table", () => {
    render(<LiveOpsContent />);
    // Items with codes A1 and B2 should appear in the table
    const a1Elements = screen.getAllByText("A1");
    expect(a1Elements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("B2").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the end session button when session is active", () => {
    render(<LiveOpsContent />);
    expect(
      screen.getByRole("button", { name: /Terminer le live/ }),
    ).toBeInTheDocument();
  });

  it("displays KPI section with article count label", () => {
    render(<LiveOpsContent />);
    expect(screen.getByText("Articles du live")).toBeInTheDocument();
    expect(screen.getAllByText("Réservations actives").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/file d'attente/)).toBeInTheDocument();
  });
});

/**
 * `live.addItemFromCatalogue` existait depuis longtemps — il hérite du code, du
 * stock et de la photo de l'article — et aucune interface ne l'appelait. Pendant
 * un live, il fallait donc retaper un article déjà enregistré, alors que le
 * téléphone sert à filmer.
 *
 * Il a remplacé deux boutons d'en-tête, « Paramètres » et « Exporter », qui
 * n'avaient aucun gestionnaire : deux icônes sans action.
 */
describe("LiveOpsContent — ajouter depuis le catalogue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("les anciens boutons sans action ont disparu", () => {
    render(<LiveOpsContent />);
    expect(screen.queryByRole("button", { name: "Paramètres" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exporter" })).not.toBeInTheDocument();
  });

  it("ouvre le catalogue et ajoute l'article choisi", async () => {
    const user = userEvent.setup();
    render(<LiveOpsContent />);

    await user.click(screen.getByRole("button", { name: /Depuis le catalogue/ }));
    await user.click(await screen.findByRole("button", { name: /A12/ }));

    expect(mockAddFromCatalogue).toHaveBeenCalledWith({ catalogueItemId: "cat-1" });
  });

  /** Le serveur refuse un stock épuisé : le dire évite de faire cliquer pour rien. */
  it("n'offre pas un article épuisé", async () => {
    const user = userEvent.setup();
    render(<LiveOpsContent />);

    await user.click(screen.getByRole("button", { name: /Depuis le catalogue/ }));
    expect(await screen.findByRole("button", { name: /B7/ })).toBeDisabled();
  });

  it("filtre le catalogue par code", async () => {
    const user = userEvent.setup();
    render(<LiveOpsContent />);

    await user.click(screen.getByRole("button", { name: /Depuis le catalogue/ }));
    await user.type(
      await screen.findByRole("searchbox", { name: /Chercher un article du catalogue/ }),
      "B7",
    );

    expect(screen.queryByRole("button", { name: /A12/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /B7/ })).toBeInTheDocument();
  });
});
