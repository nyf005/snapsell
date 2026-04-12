import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

vi.mock("~/trpc/react", () => ({
  api: {
    catalogue: {
      list: {
        useQuery: () => ({
          data: Array.from({ length: 21 }, (_, index) => ({
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
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
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
    expect(screen.getByText("Catalogue")).toBeInTheDocument();
  });

  it("renders the list of items with their codes", () => {
    render(<CatalogueListContent />);
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("B2")).toBeInTheDocument();
  });

  it("displays formatted prices and dash for null amounts", () => {
    render(<CatalogueListContent />);
    // A1 has amount 5000 cents = 50 XOF
    expect(screen.getByText(/50/)).toBeInTheDocument();
    // B2 has null amount → dash
    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("shows Live badge for items created in live", () => {
    render(<CatalogueListContent />);
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Manuel")).toBeInTheDocument();
  });

  it("paginates the catalogue table", async () => {
    const user = userEvent.setup();

    render(<CatalogueListContent />);

    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.queryByText("C21")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Suivant" }));

    expect(screen.getByText("C21")).toBeInTheDocument();
    expect(screen.queryByText("A1")).not.toBeInTheDocument();
  });
});
