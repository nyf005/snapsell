import { describe, expect, it } from "vitest";

import {
  findOverriddenCommunes,
  normalizeCommuneName,
  resolveDeliveryFee,
  type DeliveryCommuneInput,
  type DeliveryZoneInput,
} from "./resolve-delivery-fee";

const ZONES: DeliveryZoneInput[] = [
  { name: "Abidjan", amount: 200_000, communes: ["Cocody", "Marcory", "Yopougon"] },
  { name: "Intérieur du pays", amount: 500_000, communes: ["Bouaké"] },
];

const COMMUNES: DeliveryCommuneInput[] = [{ communeName: "Cocody", amount: 150_000 }];

describe("normalizeCommuneName", () => {
  it("ignore la casse, les accents et les espaces", () => {
    expect(normalizeCommuneName("  COCODY ")).toBe("cocody");
    expect(normalizeCommuneName("Abobô")).toBe("abobo");
    expect(normalizeCommuneName("Grand  Bassam")).toBe("grand bassam");
  });
});

describe("resolveDeliveryFee — préséance", () => {
  it("le prix par commune l’emporte sur celui de sa zone", () => {
    const r = resolveDeliveryFee("Cocody", ZONES, COMMUNES);
    expect(r.amount).toBe(150_000);
    expect(r.source).toBe("commune");
    expect(r.label).toBe("Cocody");
  });

  it("utilise le prix de zone quand la commune n’a pas de prix propre", () => {
    const r = resolveDeliveryFee("Marcory", ZONES, COMMUNES);
    expect(r.amount).toBe(200_000);
    expect(r.source).toBe("zone");
    expect(r.label).toBe("Abidjan");
  });

  it("retombe sur « Intérieur du pays » pour une commune inconnue", () => {
    const r = resolveDeliveryFee("Korhogo", ZONES, COMMUNES);
    expect(r.amount).toBe(500_000);
    expect(r.source).toBe("fallback-zone");
  });

  it("retombe sur la zone de repli si la commune est absente de l’adresse", () => {
    expect(resolveDeliveryFee(null, ZONES, COMMUNES).source).toBe("fallback-zone");
    expect(resolveDeliveryFee("", ZONES, COMMUNES).source).toBe("fallback-zone");
  });

  it("n’applique aucun frais quand rien n’est configuré", () => {
    const r = resolveDeliveryFee("Cocody", [], []);
    expect(r.amount).toBeNull();
    expect(r.source).toBe("none");
  });

  it("n’applique aucun frais si aucune règle ne matche et qu’il n’y a pas de repli", () => {
    const zonesSansRepli: DeliveryZoneInput[] = [
      { name: "Abidjan", amount: 200_000, communes: ["Cocody"] },
    ];
    const r = resolveDeliveryFee("Korhogo", zonesSansRepli, []);
    expect(r.amount).toBeNull();
    expect(r.source).toBe("none");
  });
});

describe("resolveDeliveryFee — robustesse de saisie", () => {
  it.each(["Cocody", "cocody", "COCODY", "  Cocody  "])(
    "reconnaît la commune écrite « %s »",
    (input) => {
      expect(resolveDeliveryFee(input, ZONES, COMMUNES).amount).toBe(150_000);
    },
  );

  it("reconnaît une commune de zone malgré les accents", () => {
    const zones: DeliveryZoneInput[] = [
      { name: "Abidjan", amount: 200_000, communes: ["Abobô"] },
    ];
    expect(resolveDeliveryFee("abobo", zones, []).amount).toBe(200_000);
  });
});

describe("findOverriddenCommunes", () => {
  it("signale une commune présente dans une zone et dans la table par commune", () => {
    const overridden = findOverriddenCommunes(ZONES, COMMUNES);
    expect(overridden).toHaveLength(1);
    expect(overridden[0]).toMatchObject({
      communeName: "Cocody",
      communeAmount: 150_000,
      zoneName: "Abidjan",
      zoneAmount: 200_000,
    });
  });

  it("ne signale rien quand les deux listes sont disjointes", () => {
    expect(findOverriddenCommunes(ZONES, [{ communeName: "Daloa", amount: 300_000 }])).toEqual(
      [],
    );
  });

  it("détecte le chevauchement malgré une casse différente", () => {
    expect(findOverriddenCommunes(ZONES, [{ communeName: "cocody", amount: 1 }])).toHaveLength(
      1,
    );
  });
});
