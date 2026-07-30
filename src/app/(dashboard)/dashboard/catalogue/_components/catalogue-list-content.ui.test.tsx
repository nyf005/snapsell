import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard/catalogue",
}));

// Mock DashboardHeader (depends on sidebar context)
vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

const mockRefetch = vi.fn();
const mockDelete = vi.fn();
const { catalogueItems } = vi.hoisted(() => ({
  catalogueItems: Array.from({ length: 21 }, (_, index) => ({
    id: `cat-${index + 1}`,
    code: index === 0 ? "A1" : index === 1 ? "B2" : `C${index + 1}`,
    amount: index === 1 ? null : 5000,
    quantity: index + 1,
    availableQty: Math.max(index, 0),
    reservedQty: index === 0 ? 1 : 0,
    mediaStorageKey: index === 1 ? "photos/b2.jpg" : null,
    attributes: null,
    origin: index === 1 ? "live" : "dashboard",
    createdInLive: index === 1,
    // Seul A1 est synchronisé : l'action « envoyer la fiche » ne doit apparaître
    // que là, `sendProductCard` refusant un article non synchronisé.
    syncedToMeta: index === 0,
    name: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
}));

const mockSendProductCard = vi.fn();

vi.mock("~/trpc/react", () => ({
  api: {
    // `live.sendProductCard` existait sans appelant : le catalogue est le seul
    // écran qui connaisse le numéro réel d'une cliente.
    live: {
      sendProductCard: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockSendProductCard.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
    // Consommé par SetupRequiredBanner ; boutique connectée → bandeau masqué.
    onboarding: {
      getStatus: {
        useQuery: () => ({ data: { whatsappConnected: true }, isLoading: false }),
      },
    },
    catalogue: {
      list: {
        useQuery: () => ({
          data: {
            items: catalogueItems,
            nextCursor: null,
          },
          isLoading: false,
          refetch: mockRefetch,
        }),
      },
      r2Status: {
        useQuery: () => ({
          data: { configured: true },
        }),
      },
      create: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      update: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      syncToMeta: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          mutate: vi.fn(),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      listVariants: {
        useQuery: () => ({
          data: [],
          isLoading: false,
        }),
      },
      upsertVariants: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      deleteVariants: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      delete: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (err: Error) => void }) => ({
          mutate: mockDelete.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
        }),
      },
    },
  },
}));

import { CatalogueListContent } from "./catalogue-list-content";

describe("CatalogueListContent", () => {
  it("renders the catalogue header", () => {
    render(<CatalogueListContent />);
    expect(screen.getByRole("heading", { name: "Catalogue" })).toBeInTheDocument();
  });

  // DataList rend deux compositions complètes (tableau ≥ md, cartes en dessous) :
  // chaque valeur est donc présente deux fois dans le DOM, une seule étant visible.
  it("renders the list of items with their codes", () => {
    render(<CatalogueListContent />);
    expect(screen.getAllByText("A1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B2").length).toBeGreaterThan(0);
  });

  it("expose chaque article dans la composition mobile", () => {
    render(<CatalogueListContent />);
    const list = screen.getByRole("list", { name: "Articles du catalogue" });
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("displays formatted prices and dash for null amounts", () => {
    render(<CatalogueListContent />);
    // A1 has amount 5000 cents = 50 XOF
    expect(screen.getAllByText(/50/).length).toBeGreaterThan(0);
    // B2 has null amount → dash
    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("shows Live badge for items created in live", () => {
    render(<CatalogueListContent />);
    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manuel").length).toBeGreaterThan(0);
  });

  it("keeps loading disabled when the API has no next cursor", () => {
    render(<CatalogueListContent />);

    expect(screen.getAllByText("A1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("C21").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Charger la suite" })).toBeDisabled();
  });
});

/**
 * `live.sendProductCard` existait sans appelant. Il envoie la fiche officielle du
 * catalogue Meta, celle depuis laquelle la cliente commande dans WhatsApp sans
 * qu'on lui décrive l'article à la main.
 *
 * Le catalogue est l'endroit naturel : la procédure exige le numéro réel, et
 * l'écran live n'expose que des numéros masqués.
 */
describe("CatalogueListContent — envoyer la fiche produit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("n'offre l'action que sur un article synchronisé avec Meta", async () => {
    render(<CatalogueListContent />);

    // `DataList` rend chaque ligne deux fois — tableau et carte mobile.
    expect(
      await screen.findAllByRole("button", { name: /Envoyer la fiche de l’article A1/ }),
    ).not.toHaveLength(0);
    expect(
      screen.queryAllByRole("button", { name: /Envoyer la fiche de l’article B2/ }),
    ).toHaveLength(0);
  });

  it("envoie la fiche au numéro saisi", async () => {
    const user = userEvent.setup();
    render(<CatalogueListContent />);

    await user.click(
      (await screen.findAllByRole("button", { name: /Envoyer la fiche de l’article A1/ }))[0]!,
    );
    await user.type(screen.getByLabelText(/Numéro de la cliente/), "+2250701020304");
    await user.click(screen.getByRole("button", { name: "Envoyer la fiche" }));

    expect(mockSendProductCard).toHaveBeenCalledWith({
      catalogueItemId: "cat-1",
      clientPhone: "+2250701020304",
    });
  });

  /** Validé côté client avec le même prédicat que le serveur : pas d'aller-retour
   *  réseau pour une faute de frappe. */
  it("refuse un numéro mal formé sans appeler le serveur", async () => {
    const user = userEvent.setup();
    render(<CatalogueListContent />);

    await user.click(
      (await screen.findAllByRole("button", { name: /Envoyer la fiche de l’article A1/ }))[0]!,
    );
    await user.type(screen.getByLabelText(/Numéro de la cliente/), "0701020304");
    await user.click(screen.getByRole("button", { name: "Envoyer la fiche" }));

    expect(mockSendProductCard).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/format international/);
  });
});
