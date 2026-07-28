import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";

// Mock next dependencies
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard/orders",
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock DashboardHeader
vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

const ORDERS = [
  {
    id: "order-1",
    orderNumber: "CMD-2025-001",
    liveItemCode: "A1",
    clientPhone: "+225 ** 03 04",
    status: "confirmed",
    depositStatus: null,
    createdAt: new Date("2025-01-15T10:00:00Z"),
  },
  {
    id: "order-2",
    orderNumber: "CMD-2025-002",
    liveItemCode: "B2",
    clientPhone: "+225 ** 07 08",
    status: "delivered",
    depositStatus: null,
    createdAt: new Date("2025-01-16T14:00:00Z"),
  },
  {
    id: "order-3",
    orderNumber: "CMD-2025-003",
    liveItemCode: null,
    clientPhone: "+225 ** 11 12",
    status: "cancelled",
    depositStatus: null,
    createdAt: new Date("2025-01-17T09:00:00Z"),
  },
];

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      orders: { list: { invalidate: vi.fn() }, exportCsv: { fetch: vi.fn() } },
    }),
    orders: {
      list: {
        useQuery: () => ({ data: { items: ORDERS, nextCursor: null }, isLoading: false }),
      },
      updateStatus: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
          error: null,
          reset: vi.fn(),
        }),
      },
    },
    proofs: {
      pendingCount: {
        useQuery: () => ({ data: 2 }),
      },
    },
  },
}));

import { OrdersListContent } from "./orders-list-content";

describe("OrdersListContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page header", () => {
    render(<OrdersListContent />);
    expect(
      screen.getByRole("heading", { name: "Commandes" }),
    ).toBeInTheDocument();
  });

  // DataList rend deux compositions complètes (tableau ≥ md, cartes en dessous) :
  // chaque valeur apparaît deux fois dans le DOM, une seule étant visible.
  it("renders all orders in the table", async () => {
    render(<OrdersListContent />);
    expect((await screen.findAllByText("CMD-2025-001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("CMD-2025-002").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CMD-2025-003").length).toBeGreaterThan(0);
  });

  // Régression : l'onglet « À préparer » affichait des lignes marquées « Confirmée ».
  it("un onglet d’état porte le même mot que le badge correspondant", async () => {
    render(<OrdersListContent />);
    await screen.findAllByText("CMD-2025-001");

    // « Confirmée » existe comme onglet ET comme badge : même mot des deux côtés.
    expect(screen.getAllByText("Confirmée").length).toBeGreaterThan(1);
    // Les anciens libellés divergents ont disparu.
    expect(screen.queryByText("À préparer")).not.toBeInTheDocument();
    expect(screen.queryByText("Prépa")).not.toBeInTheDocument();
    // La seule vue transversale reste, sans équivalent en badge.
    expect(screen.getByText("À traiter")).toBeInTheDocument();
  });

  it("expose chaque commande dans la composition mobile", async () => {
    render(<OrdersListContent />);
    const list = await screen.findByRole("list", { name: "Liste des commandes" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("displays status badges for each order", async () => {
    render(<OrdersListContent />);
    expect((await screen.findAllByText("Confirmée")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Livrée").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Annulée").length).toBeGreaterThan(0);
  });

  it("shows pending proofs link when proofs exist", () => {
    render(<OrdersListContent />);
    expect(
      screen.getByText(/2 preuves à valider/),
    ).toBeInTheDocument();
  });
});
