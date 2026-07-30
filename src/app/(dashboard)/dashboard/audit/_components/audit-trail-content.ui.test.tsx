/**
 * Tests du journal d'activité.
 *
 * C'est l'écran qu'on ouvre quand une cliente conteste : « je n'ai jamais reçu
 * ce message », « ma commande a été annulée sans raison ». Il n'a de valeur que
 * s'il est lisible et complet. Trois choses le cassent en silence :
 *
 * 1. Un événement inconnu affiché en `snake_case` technique — la vendeuse n'y
 *    comprend rien, l'événement est là mais illisible.
 * 2. Le filtre par catégorie qui masque des lignes qu'il devrait garder.
 * 3. L'export CSV offert à qui ne devrait pas l'avoir : le journal contient les
 *    numéros et l'historique de toute la boutique.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockExportFetch = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ eventLog: { exportCsv: { fetch: mockExportFetch } } }),
    eventLog: {
      list: {
        useQuery: () => ({
          data: { items: state.items, nextCursor: undefined },
          isLoading: false,
        }),
      },
    },
  },
}));

vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => null,
}));

import { AuditTrailContent } from "./audit-trail-content";

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    eventType: "order_created",
    actorType: "seller",
    entityId: "order-1",
    payload: {},
    createdAt: new Date("2026-07-30T10:00:00Z"),
    ...overrides,
  };
}

describe("AuditTrailContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.items = [];
    mockExportFetch.mockResolvedValue({ csv: "a,b\n1,2", filename: "journal.csv" });
    // `URL.createObjectURL` n'existe pas dans jsdom.
    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  function renderScreen(canExportCsv = true) {
    return render(
      <AuditTrailContent tenantId="tenant-1" canExportCsv={canExportCsv} />,
    );
  }

  /**
   * `DataList` rend deux fois chaque ligne — un tableau pour l'écran large, des
   * cartes pour le téléphone — et n'en masque qu'une par CSS. Sans feuille de
   * style, jsdom voit les deux : on interroge le tableau, sinon tout est en
   * double.
   */
  function rows() {
    return within(screen.getByRole("table"));
  }

  it("affiche un événement en clair, pas son type technique", () => {
    state.items = [event({ eventType: "order_created" })];
    renderScreen();

    expect(rows().getByText("Nouvelle commande")).toBeInTheDocument();
    expect(screen.queryByText("order_created")).not.toBeInTheDocument();
  });

  /**
   * Le repli. Un nouvel événement ajouté côté serveur sans passer par cet écran
   * s'affichait tel quel, en snake_case. Il doit rester lisible même inconnu.
   */
  it("rend lisible un événement que l'écran ne connaît pas", () => {
    state.items = [event({ eventType: "quelque_chose_de_nouveau" })];
    renderScreen();

    expect(screen.queryByText("quelque_chose_de_nouveau")).not.toBeInTheDocument();
    expect(rows().getByText(/quelque chose de nouveau/i)).toBeInTheDocument();
  });

  /** « seller », « system », « agent » ne veulent rien dire pour une vendeuse. */
  it.each([
    ["seller", "Vendeur"],
    ["system", "Système"],
    ["agent", "Automatisation"],
  ])("traduit l'auteur %s en « %s »", (actorType, expected) => {
    state.items = [event({ actorType })];
    renderScreen();

    expect(rows().getByText(expected)).toBeInTheDocument();
  });

  describe("filtre par catégorie", () => {
    it("ne garde que les événements de la catégorie choisie", async () => {
      const user = userEvent.setup();
      state.items = [
        event({ id: "e1", eventType: "order_created" }),
        event({ id: "e2", eventType: "message_sent" }),
      ];
      renderScreen();

      expect(rows().getByText("Nouvelle commande")).toBeInTheDocument();
      expect(rows().getByText("Message envoyé au client")).toBeInTheDocument();

      await user.click(screen.getByRole("combobox", { name: /Catégorie/i }));
      await user.click(await screen.findByRole("option", { name: "Messages" }));

      expect(rows().queryByText("Nouvelle commande")).not.toBeInTheDocument();
      expect(rows().getByText("Message envoyé au client")).toBeInTheDocument();
    });

    it("montre tout quand aucune catégorie n'est choisie", () => {
      state.items = [
        event({ id: "e1", eventType: "order_created" }),
        event({ id: "e2", eventType: "live_session_created" }),
      ];
      renderScreen();

      expect(rows().getByText("Nouvelle commande")).toBeInTheDocument();
      expect(rows().getByText("Live démarré")).toBeInTheDocument();
    });
  });

  /**
   * Le journal exporté contient les numéros des clientes et tout l'historique de
   * la boutique. Le droit est décidé côté serveur ; l'écran ne doit pas proposer
   * un bouton que l'appel refusera.
   */
  describe("export CSV", () => {
    it("ne propose pas l'export à qui n'y a pas droit", () => {
      state.items = [event()];
      renderScreen(false);

      expect(
        screen.queryByRole("button", { name: /Exporter/i }),
      ).not.toBeInTheDocument();
    });

    it("exporte avec les filtres en cours", async () => {
      const user = userEvent.setup();
      state.items = [event()];
      renderScreen();

      await user.click(screen.getByRole("button", { name: /Exporter le journal/i }));

      expect(mockExportFetch).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-1" }),
      );
    });

    /** Un export qui échoue en silence laisse croire au téléchargement. */
    it("annonce l'échec de l'export au lieu de ne rien faire", async () => {
      const user = userEvent.setup();
      mockExportFetch.mockRejectedValue(new Error("indisponible"));
      state.items = [event()];
      renderScreen();

      await user.click(screen.getByRole("button", { name: /Exporter le journal/i }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
    });
  });

  /** 20 lignes par page : au-delà, l'écran devient illisible sur téléphone. */
  it("pagine à 20 lignes", () => {
    state.items = Array.from({ length: 25 }, (_, i) =>
      event({ id: `e${i}`, entityId: `order-${i}` }),
    );
    renderScreen();

    expect(rows().getAllByText("Nouvelle commande")).toHaveLength(20);
  });

  it("n'affiche aucune ligne quand le journal est vide", () => {
    renderScreen();

    expect(screen.queryByText("Nouvelle commande")).not.toBeInTheDocument();
  });
});
