import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

const mockStartLive = vi.fn();
const mockEndLive = vi.fn();
const mockReleaseReservation = vi.fn();

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      live: { getLiveOpsData: { invalidate: vi.fn() } },
    }),
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
    expect(screen.getByText("Live Ops")).toBeInTheDocument();
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
      screen.getByRole("button", { name: /Terminer la session/ }),
    ).toBeInTheDocument();
  });

  it("displays KPI section with article count label", () => {
    render(<LiveOpsContent />);
    expect(screen.getByText("Articles en session")).toBeInTheDocument();
    expect(screen.getAllByText("Réservations actives").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/file d'attente/)).toBeInTheDocument();
  });
});
