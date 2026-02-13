import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
    ...props
  }: {
    children: React.ReactNode;
    href: string;
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
        useQuery: () => ({ data: ORDERS, isLoading: false }),
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
      screen.getByText("Gestion des commandes"),
    ).toBeInTheDocument();
  });

  it("renders all orders in the table", () => {
    render(<OrdersListContent />);
    expect(screen.getByText("CMD-2025-001")).toBeInTheDocument();
    expect(screen.getByText("CMD-2025-002")).toBeInTheDocument();
    expect(screen.getByText("CMD-2025-003")).toBeInTheDocument();
  });

  it("displays status badges for each order", () => {
    render(<OrdersListContent />);
    // Each status appears as both a tab label and a badge in the table.
    // getAllByText confirms badges are rendered (at least 2 per status: tab + badge).
    expect(screen.getAllByText("Confirmée").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Livrée").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Annulée").length).toBeGreaterThanOrEqual(2);
  });

  it("shows pending proofs link when proofs exist", () => {
    render(<OrdersListContent />);
    expect(
      screen.getByText(/2 preuves à valider/),
    ).toBeInTheDocument();
  });
});
