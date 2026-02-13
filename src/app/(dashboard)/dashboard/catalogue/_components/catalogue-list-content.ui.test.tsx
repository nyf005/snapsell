import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
          data: [
            {
              id: "cat-1",
              code: "A1",
              amount: 5000,
              quantity: 3,
              availableQty: 2,
              reservedQty: 1,
              mediaStorageKey: null,
              createdInLive: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: "cat-2",
              code: "B2",
              amount: null,
              quantity: 1,
              availableQty: 1,
              reservedQty: 0,
              mediaStorageKey: "photos/b2.jpg",
              createdInLive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
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
});
