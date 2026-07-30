/**
 * Le seul endroit où le système annule une vente sans que personne clique.
 *
 * Il cherche les commandes dont le délai d'acompte est dépassé, les passe en
 * `cancelled` et prévient la cliente sur WhatsApp. Un défaut ici annule des
 * commandes valides, ou en laisse traîner d'expirées — dans les deux cas
 * silencieusement, puisque c'est une tâche de fond.
 *
 * L'`updateMany` conditionnel est la pièce à protéger : il vérifie que le statut
 * n'a pas bougé entre la lecture et l'écriture. Sans ce garde, une preuve validée
 * à la seconde près serait écrasée par l'annulation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockWriteToOutbox = vi.hoisted(() => vi.fn());
const mockLogEvent = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: { order: { findMany: mockFindMany, updateMany: mockUpdateMany } },
}));
vi.mock("~/server/messaging/outbox", () => ({ writeToOutbox: mockWriteToOutbox }));
vi.mock("~/server/events/eventLog", () => ({ logEvent: mockLogEvent }));

import { runDepositExpiryJob } from "./deposit-expiry";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    tenantId: "tenant-1",
    orderNumber: "SS-0042",
    reservation: { clientPhone: "+2250701020304", correlationId: "corr-1" },
    ...overrides,
  };
}

describe("runDepositExpiryJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockWriteToOutbox.mockResolvedValue(undefined);
    mockLogEvent.mockResolvedValue(undefined);
  });

  it("ne cherche que les acomptes en attente dont le délai est passé", async () => {
    mockFindMany.mockResolvedValue([]);

    await runDepositExpiryJob();

    const where = mockFindMany.mock.calls[0]?.[0]?.where;
    expect(where.depositStatus).toBe("deposit_pending");
    expect(where.depositExpiresAt.lte).toBeInstanceOf(Date);
  });

  it("annule la commande et prévient la cliente", async () => {
    mockFindMany.mockResolvedValue([order()]);

    const result = await runDepositExpiryJob();

    expect(result.expiredCount).toBe(1);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-1", depositStatus: "deposit_pending" },
      data: { status: "cancelled", depositStatus: "deposit_rejected" },
    });
    expect(mockWriteToOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", to: "+2250701020304" }),
    );
  });

  /**
   * Le cœur du worker. Si une preuve est validée entre la lecture et l'écriture,
   * `updateMany` ne touche aucune ligne — et la cliente ne doit alors recevoir
   * aucun message d'annulation pour une commande qui vient d'être acceptée.
   */
  it("n'annule ni ne notifie si la commande a changé entre-temps", async () => {
    mockFindMany.mockResolvedValue([order()]);
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await runDepositExpiryJob();

    expect(result.expiredCount).toBe(0);
    expect(mockWriteToOutbox).not.toHaveBeenCalled();
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it("trace l'annulation au journal d'activité", async () => {
    mockFindMany.mockResolvedValue([order()]);

    await runDepositExpiryJob();

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        eventType: "deposit_rejected",
        entityId: "order-1",
        actorType: "system",
        payload: expect.objectContaining({ reason: "deposit_deadline_expired" }),
      }),
    );
  });

  /** Le journal ne doit pas empêcher l'annulation d'aboutir. */
  it("notifie même si l'écriture au journal échoue", async () => {
    mockFindMany.mockResolvedValue([order()]);
    mockLogEvent.mockRejectedValue(new Error("journal indisponible"));

    const result = await runDepositExpiryJob();

    expect(result.expiredCount).toBe(1);
    expect(mockWriteToOutbox).toHaveBeenCalled();
  });

  /** Une notification perdue ne doit pas laisser la commande en attente. */
  it("compte la commande comme expirée même si la notification échoue", async () => {
    mockFindMany.mockResolvedValue([order()]);
    mockWriteToOutbox.mockRejectedValue(new Error("outbox indisponible"));

    await expect(runDepositExpiryJob()).resolves.toEqual({ expiredCount: 1 });
  });

  it("n'envoie rien quand la réservation n'a pas de numéro", async () => {
    mockFindMany.mockResolvedValue([order({ reservation: null })]);

    const result = await runDepositExpiryJob();

    expect(result.expiredCount).toBe(1);
    expect(mockWriteToOutbox).not.toHaveBeenCalled();
  });

  it("traite chaque commande du lot indépendamment", async () => {
    mockFindMany.mockResolvedValue([
      order({ id: "order-1", orderNumber: "SS-0001" }),
      order({ id: "order-2", orderNumber: "SS-0002" }),
      order({ id: "order-3", orderNumber: "SS-0003" }),
    ]);
    // La deuxième a été traitée par ailleurs entre la lecture et l'écriture.
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await runDepositExpiryJob();

    expect(result.expiredCount).toBe(2);
    expect(mockWriteToOutbox).toHaveBeenCalledTimes(2);
  });

  it("borne le lot, pour ne pas traiter la base entière d'un coup", async () => {
    mockFindMany.mockResolvedValue([]);

    await runDepositExpiryJob();

    expect(mockFindMany.mock.calls[0]?.[0]?.take).toBe(50);
  });

  it("ne fait rien quand aucune commande n'a expiré", async () => {
    mockFindMany.mockResolvedValue([]);

    await expect(runDepositExpiryJob()).resolves.toEqual({ expiredCount: 0 });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
