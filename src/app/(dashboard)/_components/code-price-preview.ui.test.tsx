import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const { categoriesRef } = vi.hoisted(() => ({
  categoriesRef: {
    current: [] as { categoryLetter: string; amount: number; description: string | null }[],
    loading: false,
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    catalogue: {
      getCategoryLabels: {
        useQuery: () => ({
          data: categoriesRef.loading ? undefined : categoriesRef.current,
          isLoading: categoriesRef.loading,
        }),
      },
    },
  },
}));

import { CodePricePreview } from "./code-price-preview";

function setCategories(
  rows: { categoryLetter: string; amount: number; description?: string | null }[],
) {
  categoriesRef.loading = false;
  categoriesRef.current = rows.map((r) => ({ ...r, description: r.description ?? null }));
}

describe("CodePricePreview — correspondance trouvée", () => {
  it("affiche la catégorie résolue et le prix", () => {
    setCategories([{ categoryLetter: "A", amount: 500_000 }]);
    render(<CodePricePreview code="A12" />);
    expect(screen.getByText("A12")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("5 000 FCFA")).toBeInTheDocument();
  });

  it("applique le plus long préfixe, pas la première lettre", () => {
    setCategories([
      { categoryLetter: "A", amount: 500_000 },
      { categoryLetter: "AB", amount: 900_000 },
    ]);
    render(<CodePricePreview code="AB12" />);
    expect(screen.getByText("AB")).toBeInTheDocument();
    expect(screen.getByText("9 000 FCFA")).toBeInTheDocument();
  });

  it("résout une catégorie mot entier", () => {
    setCategories([{ categoryLetter: "Premium", amount: 2_500_000 }]);
    render(<CodePricePreview code="Premium3" />);
    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(screen.getByText("25 000 FCFA")).toBeInTheDocument();
  });

  it("ajoute la description de la catégorie quand elle existe", () => {
    setCategories([{ categoryLetter: "A", amount: 500_000, description: "Robes femme" }]);
    render(<CodePricePreview code="A1" />);
    expect(screen.getByText(/Robes femme/)).toBeInTheDocument();
  });
});

describe("CodePricePreview — aucune correspondance", () => {
  it("liste les catégories existantes pour orienter la vendeuse", () => {
    setCategories([
      { categoryLetter: "A", amount: 500_000 },
      { categoryLetter: "B", amount: 900_000 },
    ]);
    render(<CodePricePreview code="Z9" />);
    expect(screen.getByText(/Aucune catégorie ne correspond/)).toBeInTheDocument();
    expect(screen.getByText("A, B")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ajouter une catégorie/ })).toHaveAttribute(
      "href",
      "/parametres",
    );
  });

  it("signale le piège du préfixe partiel (grille [AB], code A1)", () => {
    setCategories([{ categoryLetter: "AB", amount: 500_000 }]);
    render(<CodePricePreview code="A1" />);
    expect(screen.getByText(/Aucune catégorie ne correspond/)).toBeInTheDocument();
  });

  it("invite à créer une catégorie quand la grille est vide", () => {
    setCategories([]);
    render(<CodePricePreview code="A12" />);
    expect(screen.getByText(/pas encore de catégorie de prix/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /En créer une/ })).toBeInTheDocument();
  });
});

describe("CodePricePreview — cas où rien ne s’affiche", () => {
  it("reste muet sur un code vide", () => {
    setCategories([{ categoryLetter: "A", amount: 500_000 }]);
    const { container } = render(<CodePricePreview code="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  it("s’efface quand la vendeuse a saisi un prix manuel", () => {
    setCategories([{ categoryLetter: "A", amount: 500_000 }]);
    const { container } = render(<CodePricePreview code="A12" disabled />);
    expect(container).toBeEmptyDOMElement();
  });

  it("n’affiche rien pendant le chargement", () => {
    categoriesRef.loading = true;
    const { container } = render(<CodePricePreview code="A12" />);
    expect(container).toBeEmptyDOMElement();
    categoriesRef.loading = false;
  });
});
