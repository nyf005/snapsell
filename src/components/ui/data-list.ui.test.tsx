import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";

import { DataList, type DataListColumn } from "./data-list";

type Row = { id: string; category: string; price: string; description: string; updated: string };

const ROWS: Row[] = [
  { id: "1", category: "A", price: "5 000 FCFA", description: "Robes", updated: "hier" },
  { id: "2", category: "B", price: "9 000 FCFA", description: "Chaussures", updated: "hier" },
];

const COLUMNS: DataListColumn<Row>[] = [
  { id: "category", header: "Catégorie", cell: (r) => r.category, role: "primary" },
  { id: "price", header: "Prix", cell: (r) => r.price, role: "secondary" },
  { id: "description", header: "Description", cell: (r) => r.description, role: "meta" },
  { id: "updated", header: "Dernière MAJ", cell: (r) => r.updated, role: "hiddenOnMobile" },
];

function renderList(props: Partial<React.ComponentProps<typeof DataList<Row>>> = {}) {
  return render(
    <DataList
      items={ROWS}
      getKey={(r) => r.id}
      columns={COLUMNS}
      label="Catégories"
      {...props}
    />,
  );
}

describe("DataList — composition desktop", () => {
  it("rend un tableau avec toutes les colonnes", () => {
    renderList();
    const table = screen.getByRole("table");
    for (const header of ["Catégorie", "Prix", "Description", "Dernière MAJ"]) {
      expect(within(table).getByText(header)).toBeInTheDocument();
    }
  });

  it("ajoute une colonne Actions quand des actions sont fournies", () => {
    renderList({ actions: (r) => <button>Modifier {r.category}</button> });
    expect(within(screen.getByRole("table")).getByText("Actions")).toBeInTheDocument();
  });
});

describe("DataList — composition mobile", () => {
  it("rend une carte par élément", () => {
    renderList();
    const list = screen.getByRole("list", { name: "Catégories" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("expose les colonnes primary, secondary et meta", () => {
    renderList();
    const first = within(screen.getByRole("list", { name: "Catégories" })).getAllByRole(
      "listitem",
    )[0]!;
    expect(within(first).getByText("A")).toBeInTheDocument();
    expect(within(first).getByText("5 000 FCFA")).toBeInTheDocument();
    expect(within(first).getByText("Description :")).toBeInTheDocument();
    expect(within(first).getByText("Robes")).toBeInTheDocument();
  });

  it("omet les colonnes marquées hiddenOnMobile", () => {
    renderList();
    const list = screen.getByRole("list", { name: "Catégories" });
    expect(within(list).queryByText("Dernière MAJ :")).not.toBeInTheDocument();
  });

  it("rend les actions dans chaque carte", () => {
    renderList({ actions: (r) => <button>Modifier {r.category}</button> });
    const list = screen.getByRole("list", { name: "Catégories" });
    expect(within(list).getByRole("button", { name: "Modifier A" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Modifier B" })).toBeInTheDocument();
  });

  it("ne produit aucun conteneur à défilement horizontal", () => {
    const { container } = renderList();
    const mobile = container.querySelector(".md\\:hidden");
    expect(mobile?.querySelector(".overflow-x-auto")).toBeNull();
  });
});

describe("DataList — état vide", () => {
  it("affiche le même nœud vide dans les deux compositions", () => {
    render(
      <DataList
        items={[]}
        getKey={(r: Row) => r.id}
        columns={COLUMNS}
        empty={<p>Aucune catégorie</p>}
      />,
    );
    // Une occurrence pour le tableau, une pour les cartes : les deux branches
    // rendent le même contenu, ce qui empêche les états vides de diverger.
    expect(screen.getAllByText("Aucune catégorie")).toHaveLength(2);
  });

  it("ne rend aucune ligne de données quand la liste est vide", () => {
    render(
      <DataList
        items={[]}
        getKey={(r: Row) => r.id}
        columns={COLUMNS}
        label="Catégories"
        empty={<p>Aucune catégorie</p>}
      />,
    );
    expect(screen.queryByRole("list", { name: "Catégories" })).not.toBeInTheDocument();
  });
});

describe("DataList — clés", () => {
  it("utilise getKey sans dupliquer de clé", () => {
    const getKey = vi.fn((r: Row) => r.id);
    renderList({ getKey });
    expect(getKey).toHaveBeenCalled();
    const keys = ROWS.map(getKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
