import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock DashboardHeader
vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockBulkApprove = vi.fn();
const mockBulkReject = vi.fn();

const PROOFS = [
  {
    id: "proof-1",
    orderNumber: "CMD-001",
    clientPhone: "+225 01 01 02 03 04",
    mediaStorageKey: "proofs/p1.jpg",
    textPayload: null,
    createdAt: new Date("2025-01-15T10:00:00Z"),
  },
  {
    id: "proof-2",
    orderNumber: "CMD-002",
    clientPhone: "+225 05 06 07 08 09",
    mediaStorageKey: null,
    textPayload: "Paiement effectué",
    createdAt: new Date("2025-01-16T14:00:00Z"),
  },
];

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      proofs: { listPending: { invalidate: vi.fn() } },
    }),
    proofs: {
      listPending: {
        useQuery: () => ({ data: PROOFS, isLoading: false }),
      },
      approve: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockApprove.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      reject: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockReject.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      bulkApprove: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockBulkApprove.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      bulkReject: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: mockBulkReject.mockImplementation(() => opts.onSuccess?.()),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

import { ProofsListContent } from "./proofs-list-content";

describe("ProofsListContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page title", () => {
    render(<ProofsListContent />);
    expect(
      screen.getByText(/Vérification des preuves/),
    ).toBeInTheDocument();
  });

  it("renders proof entries with order numbers", () => {
    render(<ProofsListContent />);
    expect(screen.getByText("CMD-001")).toBeInTheDocument();
    expect(screen.getByText("CMD-002")).toBeInTheDocument();
  });

  it("calls approve mutation when Valider is clicked", async () => {
    const user = userEvent.setup();
    render(<ProofsListContent />);

    const validateButtons = screen.getAllByRole("button", {
      name: /Valider la preuve pour la commande/,
    });
    await user.click(validateButtons[0]!);

    expect(mockApprove).toHaveBeenCalledWith({ proofId: "proof-1" });
  });

  it("calls reject mutation when refuse button is clicked", async () => {
    const user = userEvent.setup();
    render(<ProofsListContent />);

    const rejectButtons = screen.getAllByRole("button", {
      name: /Refuser la preuve pour la commande/,
    });
    await user.click(rejectButtons[0]!);

    expect(mockReject).toHaveBeenCalledWith({ proofId: "proof-1" });
  });
});
