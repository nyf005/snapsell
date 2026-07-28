import { describe, expect, it } from "vitest";

import {
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABEL,
  ORDER_WORK_VIEW_STATUSES,
  orderFilterOptions,
  orderStatusLabel,
  orderWorkViews,
  statusesForView,
} from "./orders";
import { ORDER_STATUS_TRANSITIONS } from "~/lib/order-status-transitions";

/**
 * Trois tables de libellés coexistaient et se contredisaient : l'onglet
 * « À préparer » affichait des lignes marquées « Confirmée ». Ces tests
 * empêchent la divergence de revenir, en imposant que filtres et onglets
 * soient **dérivés** de la table unique.
 */

describe("Statuts de commande — couverture", () => {
  it("libelle exactement les états du schéma, ni plus ni moins", () => {
    expect(Object.keys(ORDER_STATUS_LABEL).sort()).toEqual(
      Object.keys(ORDER_STATUS_TRANSITIONS).sort(),
    );
  });

  it("l’ordre du flux couvre tous les états", () => {
    expect([...ORDER_STATUS_FLOW].sort()).toEqual(Object.keys(ORDER_STATUS_LABEL).sort());
  });

  it("aucun libellé vide", () => {
    for (const [key, label] of Object.entries(ORDER_STATUS_LABEL)) {
      expect(label, key).toBeTruthy();
    }
  });

  it("aucun libellé partagé par deux états", () => {
    const labels = Object.values(ORDER_STATUS_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Statuts de commande — vues dérivées", () => {
  it("le filtre reprend les libellés des badges, verbatim", () => {
    for (const option of orderFilterOptions) {
      if (option.value === "") continue;
      expect(option.label).toBe(ORDER_STATUS_LABEL[option.value]);
    }
  });

  it("chaque onglet d’état porte le libellé de son badge", () => {
    // C'est le cœur de la régression : cliquer « À préparer » montrait « Confirmée ».
    for (const view of orderWorkViews) {
      if (view.value === "" || view.value === "to_process") continue;
      expect(view.label, view.value).toBe(ORDER_STATUS_LABEL[view.value]);
    }
  });

  it("une seule vue transversale, et elle n’a pas d’équivalent en badge", () => {
    const crossCutting = orderWorkViews.filter(
      (v) => v.value !== "" && ORDER_WORK_VIEW_STATUSES[v.value].length > 1,
    );
    expect(crossCutting).toHaveLength(1);
    expect(crossCutting[0]!.value).toBe("to_process");
    expect(Object.values(ORDER_STATUS_LABEL)).not.toContain(crossCutting[0]!.label);
  });

  it("« À traiter » couvre bien ce qui attend une action", () => {
    expect(statusesForView("to_process")).toEqual([
      "confirmed_pending_deposit",
      "confirmed",
    ]);
  });

  it("« Toutes » ne filtre rien", () => {
    expect(statusesForView("")).toBeUndefined();
  });

  it("une vue d’état ne demande que cet état", () => {
    expect(statusesForView("preparing")).toEqual(["preparing"]);
  });

  it("renvoie un tableau mutable, attendu par le schéma zod", () => {
    const statuses = statusesForView("to_process");
    expect(Array.isArray(statuses)).toBe(true);
    expect(() => statuses!.push("delivered")).not.toThrow();
  });
});

describe("orderStatusLabel", () => {
  it("traduit un état connu", () => {
    expect(orderStatusLabel("preparing")).toBe("En préparation");
  });

  it("laisse passer un état inconnu plutôt que d’afficher du vide", () => {
    expect(orderStatusLabel("etat_inconnu")).toBe("etat_inconnu");
  });
});
