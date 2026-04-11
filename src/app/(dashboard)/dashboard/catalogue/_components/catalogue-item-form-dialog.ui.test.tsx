import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock tRPC
const mockMutateAsync = vi.fn();
vi.mock("~/trpc/react", () => ({
  api: {
    catalogue: {
      create: {
        useMutation: () => ({
          mutateAsync: mockMutateAsync,
          isPending: false,
        }),
      },
      update: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

import { CatalogueItemFormDialog } from "./catalogue-item-form-dialog";

describe("CatalogueItemFormDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    item: null,
    onSuccess: vi.fn(),
    r2Configured: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ id: "new-item-id" });
  });

  it("renders create mode title when item is null", () => {
    render(<CatalogueItemFormDialog {...defaultProps} />);
    expect(screen.getByText("Ajouter un article")).toBeInTheDocument();
  });

  it("renders edit mode title when item is provided", () => {
    render(
      <CatalogueItemFormDialog
        {...defaultProps}
        item={{
          id: "item-1",
          code: "A1",
          amount: 5000,
          quantity: 3,
          availableQty: 2,
          reservedQty: 1,
          mediaStorageKey: null,
          origin: "dashboard",
          createdInLive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }}
      />,
    );
    expect(screen.getByText("Modifier l'article")).toBeInTheDocument();
  });

  it("shows R2 not configured message when r2Configured is false", () => {
    render(
      <CatalogueItemFormDialog {...defaultProps} r2Configured={false} />,
    );
    expect(
      screen.getByText(/Configuration R2 requise/),
    ).toBeInTheDocument();
  });

  it("pre-fills form fields in edit mode", () => {
    render(
      <CatalogueItemFormDialog
        {...defaultProps}
        item={{
          id: "item-1",
          code: "A1",
          amount: 5000,
          quantity: 3,
          availableQty: 2,
          reservedQty: 1,
          mediaStorageKey: null,
          origin: "dashboard",
          createdInLive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }}
      />,
    );
    const codeInput = screen.getByLabelText("Code *") as HTMLInputElement;
    const quantityInput = screen.getByLabelText("Quantité *") as HTMLInputElement;
    expect(codeInput.value).toBe("A1");
    expect(quantityInput.value).toBe("3");
  });
});
