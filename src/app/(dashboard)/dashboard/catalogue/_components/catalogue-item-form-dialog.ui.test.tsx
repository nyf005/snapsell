import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock tRPC
const mockMutateAsync = vi.fn();
const mockListInvalidate = vi.fn();
vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      catalogue: {
        list: {
          invalidate: mockListInvalidate,
        },
      },
    }),
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
    expect(screen.getByText("Variantes du produit")).toBeInTheDocument();
  });

  it("renders edit mode title when item is provided", () => {
    render(
      <CatalogueItemFormDialog
        {...defaultProps}
        item={{
          id: "item-1",
          code: "A1",
          name: null,
          amount: 5000,
          quantity: 3,
          availableQty: 2,
          reservedQty: 1,
          mediaStorageKey: null,
          attributes: null,
          metaProductId: null,
          syncedToMeta: false,
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
          name: null,
          amount: 5000,
          quantity: 3,
          availableQty: 2,
          reservedQty: 1,
          mediaStorageKey: null,
          attributes: null,
          metaProductId: null,
          syncedToMeta: false,
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

  it("locks total quantity when variants are already active", () => {
    render(
      <CatalogueItemFormDialog
        {...defaultProps}
        item={{
          id: "item-1",
          code: "A1",
          name: null,
          amount: 5000,
          quantity: 3,
          availableQty: 2,
          reservedQty: 1,
          mediaStorageKey: null,
          attributes: ["Couleur", "Taille"],
          metaProductId: null,
          syncedToMeta: false,
          origin: "dashboard",
          createdInLive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }}
      />,
    );

    expect(screen.getByLabelText("Quantité *")).toBeDisabled();
    expect(
      screen.getByText(/La quantité totale est calculée automatiquement depuis les variantes/),
    ).toBeInTheDocument();
  });

  it("opens the variants section in edit mode", async () => {
    const user = userEvent.setup();

    render(
      <CatalogueItemFormDialog
        {...defaultProps}
        item={{
          id: "item-1",
          code: "A1",
          name: null,
          amount: 5000,
          quantity: 3,
          availableQty: 2,
          reservedQty: 1,
          mediaStorageKey: null,
          attributes: null,
          metaProductId: null,
          syncedToMeta: false,
          origin: "dashboard",
          createdInLive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Variantes/i }));

    expect(screen.getByText("Variantes du produit")).toBeInTheDocument();
    expect(screen.getByText("Stock par variante")).toBeInTheDocument();
  });
});
