import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "../../../generated/prisma";
import { addToWaitlist } from "./addToWaitlist";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    waitlist: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("addToWaitlist (Story 4.3 + 9.1)", () => {
  const tenantId = "tenant-1";
  const liveSessionId = "session-1";
  const liveItemId = "item-1";
  const clientPhone = "+33612345678";
  const correlationId = "corr-1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.waitlist.findFirst).mockResolvedValue(null);
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        waitlist: {
          findFirst: vi.fn(),
          create: vi.fn(),
          delete: vi.fn(),
        },
      };
      return fn(tx as unknown as Parameters<Parameters<typeof db.$transaction>[0]>[0]) as Promise<unknown>;
    });
  });

  it("returns existing position when same client+item+session already in waitlist (idempotence)", async () => {
    vi.mocked(db.waitlist.findFirst).mockResolvedValue({
      id: "w1",
      tenantId,
      liveSessionId,
      liveItemId,
      catalogueItemId: null,
      clientPhone,
      position: 2,
      correlationId,
      createdAt: new Date(),
    });

    const result = await addToWaitlist(
      tenantId,
      liveSessionId,
      liveItemId,
      clientPhone,
      correlationId,
    );

    expect(result).toEqual({ ok: true, position: 2, alreadyInWaitlist: true });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("inserts with position = max+1 under transaction when not in waitlist", async () => {
    const mockTx = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      waitlist: {
        findFirst: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    };
    mockTx.$queryRaw
      .mockResolvedValueOnce([{ id: liveItemId }])
      .mockResolvedValueOnce([{ max: 3 }]);
    mockTx.waitlist.create.mockResolvedValue({
      id: "w-new",
      position: 4,
    });

    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      return fn(mockTx as never) as Promise<unknown>;
    });

    const result = await addToWaitlist(
      tenantId,
      liveSessionId,
      liveItemId,
      clientPhone,
      correlationId,
    );

    expect(result).toEqual({ ok: true, position: 4 });
    expect(mockTx.waitlist.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        liveSessionId,
        liveItemId,
        catalogueItemId: null,
        clientPhone,
        position: 4,
        correlationId,
      },
    });
  });

  it("returns not_found when live_item does not exist", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn(),
      waitlist: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    };
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      return fn(mockTx as never) as Promise<unknown>;
    });

    const result = await addToWaitlist(
      tenantId,
      liveSessionId,
      liveItemId,
      clientPhone,
      correlationId,
    );

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  // ── Story 9.1: Catalogue item tests (no sentinel) ───────────────────

  it("Story 9.1: inserts with catalogueItemId and null liveItemId/liveSessionId for catalogue items", async () => {
    const catItemId = "cat-item-1";
    const mockTx = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      waitlist: {
        findFirst: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    };
    mockTx.$queryRaw
      .mockResolvedValueOnce([{ id: catItemId }]) // lock on catalogue_items
      .mockResolvedValueOnce([{ max: 0 }]); // position
    mockTx.waitlist.create.mockResolvedValue({
      id: "w-cat",
      position: 1,
    });

    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      return fn(mockTx as never) as Promise<unknown>;
    });

    const result = await addToWaitlist(
      tenantId,
      null, // no liveSessionId for catalogue
      null, // no liveItemId for catalogue
      clientPhone,
      correlationId,
      { table: "catalogue_items", catalogueItemId: catItemId },
    );

    expect(result).toEqual({ ok: true, position: 1 });
    expect(mockTx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mockTx.waitlist.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        liveSessionId: null,
        liveItemId: null,
        catalogueItemId: catItemId,
        clientPhone,
        position: 1,
        correlationId,
      },
    });
  });

  it("Story 9.1: returns not_found when catalogue item does not exist", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]), // no row found
      $executeRaw: vi.fn(),
      waitlist: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    };
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      return fn(mockTx as never) as Promise<unknown>;
    });

    const result = await addToWaitlist(
      tenantId,
      null,
      null,
      clientPhone,
      correlationId,
      { table: "catalogue_items", catalogueItemId: "nonexistent-cat-item" },
    );

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("Story 9.1: idempotence for catalogue — returns existing position when already in waitlist", async () => {
    const catItemId = "cat-item-1";
    vi.mocked(db.waitlist.findFirst).mockResolvedValue({
      id: "w-cat-existing",
      tenantId,
      liveSessionId: null,
      liveItemId: null,
      catalogueItemId: catItemId,
      clientPhone,
      position: 3,
      correlationId,
      createdAt: new Date(),
    });

    const result = await addToWaitlist(
      tenantId,
      null,
      null,
      clientPhone,
      correlationId,
      { table: "catalogue_items", catalogueItemId: catItemId },
    );

    expect(result).toEqual({ ok: true, position: 3, alreadyInWaitlist: true });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("on P2002 (race), returns existing position (idempotence)", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: liveItemId }]),
      $executeRaw: vi.fn(),
      waitlist: {
        findFirst: vi.fn(),
        create: vi.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("Unique constraint", {
            code: "P2002",
            clientVersion: "5.x",
          }),
        ),
      },
    };
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      return fn(mockTx as never) as Promise<unknown>;
    });
    mockTx.$queryRaw.mockResolvedValueOnce([{ id: liveItemId }]).mockResolvedValueOnce([{ max: 1 }]);
    // First findFirst returns null (initial check), second returns the race-created entry
    vi.mocked(db.waitlist.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "w-race",
        tenantId,
        liveSessionId,
        liveItemId,
        catalogueItemId: null,
        clientPhone,
        position: 1,
        correlationId,
        createdAt: new Date(),
      });

    const result = await addToWaitlist(
      tenantId,
      liveSessionId,
      liveItemId,
      clientPhone,
      correlationId,
    );

    expect(result).toEqual({ ok: true, position: 1, alreadyInWaitlist: true });
  });
});
