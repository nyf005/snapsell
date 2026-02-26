import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      settings: { getCategoryPrices: { invalidate: vi.fn() } },
    }),
    settings: {
      getCategoryPrices: {
        useQuery: () => ({
          data: [],
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

    expect(screen.getByText("Grille de prix")).toBeInTheDocument();
    expect(document.getElementById("snapsell-meta-sdk")).toBeNull();
  });
});
