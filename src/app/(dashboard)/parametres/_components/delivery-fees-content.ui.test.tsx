/**
 * Tests de l'écran des frais de livraison.
 *
 * C'est l'écran qui fixe ce que la cliente paiera en plus du produit. Deux
 * choses s'y jouent et n'étaient vérifiées nulle part :
 *
 * 1. L'unité. La vendeuse tape « 1500 » en francs, la base stocke des centimes.
 *    Une conversion perdue en route facture 100 fois trop, ou 100 fois trop peu.
 * 2. La préséance. Un tarif par commune l'emporte sur le tarif de sa zone —
 *    l'écran doit le dire, sinon la vendeuse croit avoir changé un prix qui ne
 *    changera pas.
 *
 * La règle de calcul elle-même est testée à part
 * (`lib/delivery/resolve-delivery-fee.test.ts`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockUpsertZone = vi.hoisted(() => vi.fn());
const mockDeleteZone = vi.hoisted(() => vi.fn());
const mockUpsertCommune = vi.hoisted(() => vi.fn());
const mockDeleteCommune = vi.hoisted(() => vi.fn());

type Zone = { id: string; name: string; amount: number; communeNames: string[] };
type Commune = { communeName: string; amount: number };

const state = vi.hoisted(() => ({
  zones: [] as Zone[],
  communes: [] as Commune[],
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      delivery: {
        getDeliveryZones: { invalidate: vi.fn() },
        getDeliveryFeeCommunes: { invalidate: vi.fn() },
      },
    }),
    delivery: {
      getDeliveryZones: {
        useQuery: () => ({
          data: { items: state.zones, nextCursor: undefined },
          isLoading: false,
        }),
      },
      getDeliveryFeeCommunes: {
        useQuery: () => ({
          data: { items: state.communes, nextCursor: undefined },
          isLoading: false,
        }),
      },
      upsertDeliveryZone: {
        useMutation: () => ({ mutate: mockUpsertZone, isPending: false }),
      },
      deleteDeliveryZone: {
        useMutation: () => ({ mutate: mockDeleteZone, isPending: false }),
      },
      upsertDeliveryFeeCommune: {
        useMutation: () => ({ mutate: mockUpsertCommune, isPending: false }),
      },
      deleteDeliveryFeeCommune: {
        useMutation: () => ({ mutate: mockDeleteCommune, isPending: false }),
      },
    },
  },
}));

vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => null,
}));

import { ui } from "~/lib/copy";
import { formatXof } from "~/lib/copy";

import { DeliveryFeesContent } from "./delivery-fees-content";

describe("DeliveryFeesContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.zones = [];
    state.communes = [];
  });

  async function openZoneDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Ajouter une zone" }));
    return screen.findByRole("dialog");
  }

  /**
   * Le bouton de validation se nomme « Ajouter » à la création et « Enregistrer »
   * à la modification. On le cherche dans la boîte de dialogue, sinon on retombe
   * sur le « Ajouter une zone » de la page derrière.
   */
  function submitButton(dialog: HTMLElement) {
    return within(dialog).getByRole("button", { name: /^(Ajouter|Enregistrer)$/ });
  }

  /**
   * Le point le plus coûteux à se tromper de tout l'écran. Le champ est libellé
   * « Prix (FCFA) » : ce que la vendeuse tape est donc en francs, et doit partir
   * en centimes. 1 500 F ⇒ 150 000.
   */
  it("envoie le prix d'une zone en centimes, pas en francs", async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesContent />);

    const dialog = await openZoneDialog(user);
    await user.type(screen.getByLabelText("Nom de la zone"), "Abidjan");
    await user.type(screen.getByLabelText("Prix (FCFA)"), "1500");
    await user.type(
      screen.getByLabelText(/Noms des communes/),
      "Cocody\nMarcory",
    );
    await user.click(submitButton(dialog));

    expect(mockUpsertZone).toHaveBeenCalledWith({
      name: "Abidjan",
      amount: 150_000,
      communeNames: ["Cocody", "Marcory"],
    });
  });

  /** Le retour de lecture doit refaire le chemin inverse, sinon on édite 100× le prix. */
  it("réaffiche en francs le prix stocké en centimes", async () => {
    const user = userEvent.setup();
    state.zones = [
      { id: "z1", name: "Abidjan", amount: 150_000, communeNames: ["Cocody"] },
    ];
    render(<DeliveryFeesContent />);

    await user.click(screen.getAllByRole("button", { name: "Modifier" })[0]!);

    expect(screen.getByLabelText("Prix (FCFA)")).toHaveValue("1500");
  });

  /** Une virgule, un point-virgule ou un retour à la ligne séparent aussi bien. */
  it("accepte les communes séparées par des virgules", async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesContent />);

    const dialog = await openZoneDialog(user);
    await user.type(screen.getByLabelText("Nom de la zone"), "Abidjan");
    await user.type(
      screen.getByLabelText(/Noms des communes/),
      "Cocody, Marcory ; Yopougon",
    );
    await user.click(submitButton(dialog));

    expect(mockUpsertZone.mock.calls[0]?.[0]?.communeNames).toEqual([
      "Cocody",
      "Marcory",
      "Yopougon",
    ]);
  });

  /** Sans identifiant, le serveur crée ; avec, il modifie. La distinction est ici. */
  it("passe l'identifiant de la zone quand on en modifie une", async () => {
    const user = userEvent.setup();
    state.zones = [{ id: "z1", name: "Abidjan", amount: 100_000, communeNames: [] }];
    render(<DeliveryFeesContent />);

    await user.click(screen.getAllByRole("button", { name: "Modifier" })[0]!);
    await user.click(submitButton(await screen.findByRole("dialog")));

    expect(mockUpsertZone).toHaveBeenCalledWith(
      expect.objectContaining({ id: "z1", name: "Abidjan" }),
    );
  });

  /** Un nom vide crée une zone qui ne correspondra jamais à rien. */
  it("garde l'enregistrement bloqué tant que le nom est vide", async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesContent />);

    const dialog = await openZoneDialog(user);
    await user.type(screen.getByLabelText("Prix (FCFA)"), "1500");

    expect(submitButton(dialog)).toBeDisabled();
  });

  /**
   * Supprimer un tarif fait basculer toutes les livraisons concernées sur un
   * autre montant. Ça ne doit pas partir sur un seul clic.
   */
  it("demande confirmation avant de supprimer une zone", async () => {
    const user = userEvent.setup();
    state.zones = [{ id: "z1", name: "Abidjan", amount: 100_000, communeNames: [] }];
    render(<DeliveryFeesContent />);

    await user.click(screen.getAllByRole("button", { name: "Supprimer" })[0]!);
    expect(mockDeleteZone).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /Supprimer/ }));

    expect(mockDeleteZone).toHaveBeenCalledWith({ zoneId: "z1" });
  });

  it("envoie aussi le tarif par commune en centimes", async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesContent />);

    await user.click(screen.getByRole("button", { name: "Ajouter une commune" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/commune/i), "Bouaké");
    await user.type(within(dialog).getByLabelText("Prix (FCFA)"), "2500");
    await user.click(submitButton(dialog));

    expect(mockUpsertCommune).toHaveBeenCalledWith({
      communeName: "Bouaké",
      amount: 250_000,
    });
  });

  /**
   * Le piège de l'écran : une commune tarifée à part l'emporte sur sa zone.
   * Sans avertissement, la vendeuse modifie le prix de la zone et ne comprend
   * pas que la livraison à Cocody n'ait pas bougé.
   */
  it("signale une commune dont le tarif propre l'emporte sur celui de sa zone", () => {
    state.zones = [
      { id: "z1", name: "Abidjan", amount: 100_000, communeNames: ["Cocody"] },
    ];
    state.communes = [{ communeName: "Cocody", amount: 250_000 }];
    render(<DeliveryFeesContent />);

    // Comparé au texte produit par la copie elle-même : `formatXof` insère une
    // espace insécable étroite qu'on ne peut pas taper dans un littéral. Testing
    // Library la ramène à une espace ordinaire à la lecture du DOM, donc on
    // applique la même normalisation des deux côtés avant de comparer.
    const expected = ui.delivery
      .duplicateWarning("Cocody", formatXof(250_000), formatXof(100_000))
      .replace(/\s+/g, " ");
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "P" && el.textContent?.replace(/\s+/g, " ") === expected,
      ),
    ).toBeTruthy();
  });

  it("n'affiche aucun avertissement quand aucune commune n'est doublée", () => {
    state.zones = [
      { id: "z1", name: "Abidjan", amount: 100_000, communeNames: ["Cocody"] },
    ];
    state.communes = [{ communeName: "Bouaké", amount: 250_000 }];
    render(<DeliveryFeesContent />);

    expect(
      screen.queryByText(/est appliqué, pas le prix de zone/),
    ).not.toBeInTheDocument();
  });

  /** Fermer sans enregistrer ne doit rien envoyer. */
  it("n'écrit rien si on annule", async () => {
    const user = userEvent.setup();
    render(<DeliveryFeesContent />);

    const dialog = await openZoneDialog(user);
    await user.type(screen.getByLabelText("Nom de la zone"), "Abidjan");
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

    expect(mockUpsertZone).not.toHaveBeenCalled();
  });
});
