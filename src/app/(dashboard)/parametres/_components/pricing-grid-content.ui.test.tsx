import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { emptyPriceData } = vi.hoisted(() => ({
  emptyPriceData: { items: [], nextCursor: null },
}));

vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    catalogue: {
      // Consommé par CodePricePreview.
      getCategoryLabels: {
        useQuery: () => ({
          data: [{ categoryLetter: "A", amount: 500_000, description: null }],
          isLoading: false,
        }),
      },
    },
    useUtils: () => ({
      settings: { getCategoryPrices: { invalidate: vi.fn() } },
    }),
    settings: {
      getCategoryPrices: {
        useQuery: () => ({
          data: emptyPriceData,
          isLoading: false,
        }),
      },
      setCategoryPrices: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

import { PricingGridContent } from "./pricing-grid-content";

describe("PricingGridContent", () => {
  it("does not inject Meta SDK script outside WhatsApp settings page", () => {
    render(<PricingGridContent />);

    expect(screen.getByRole("heading", { name: "Prix" })).toBeInTheDocument();
    expect(document.getElementById("snapsell-meta-sdk")).toBeNull();
  });
});
