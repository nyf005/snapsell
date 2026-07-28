import { describe, expect, it } from "vitest";

import { botMsg } from "./templates";

describe("botMsg UX contract", () => {
  it("structures a reservation message as state then next action", () => {
    const message = botMsg.client.reserved("A12");

    expect(message).toContain("A12 est réservé");
    expect(message).toContain("Prochaine étape");
    expect(message).toContain("adresse de livraison");
  });

  it("keeps the reservation recap behavior and button identifiers unchanged", () => {
    const message = botMsg.client.recapInteractive(
      "A12",
      "5 000 FCFA",
      "6 500 FCFA",
      "Cocody, Angré",
    );

    expect(message.body).toContain("Commande prête à confirmer");
    expect(message.body).toContain("A12");
    const interactive = message.interactive;
    if (!interactive || interactive.type !== "buttons") {
      throw new Error("Expected a buttons payload");
    }
    expect(interactive.buttons.map((button) => button.id)).toEqual([
      "confirm_order",
      "cancel_order",
      "add_item",
    ]);
  });

  it("keeps deposit proof actions while making the next step explicit", () => {
    const message = botMsg.client.proofRejectedInteractive("SS-1234");

    expect(message.body).toContain("Preuve refusée");
    expect(message.body).toContain("nouvelle preuve");
    const interactive = message.interactive;
    if (!interactive || interactive.type !== "buttons") {
      throw new Error("Expected a buttons payload");
    }
    expect(interactive.buttons.map((button) => button.id)).toEqual([
      "send_proof",
      "contact_agent",
    ]);
  });

  it("uses the same canonical order vocabulary for delivery states", () => {
    expect(botMsg.client.orderConfirmed()).toContain("Commande confirmée");
    expect(botMsg.client.orderInDelivery("SS-1234")).toContain("en livraison");
    expect(botMsg.client.orderDelivered("SS-1234")).toContain("livrée");
    expect(botMsg.client.orderCancelled("SS-1234")).toContain("annulée");
  });
});
