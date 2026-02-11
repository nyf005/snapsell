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

describe("addToWaitlist (Story 4.3)", () => {
  const tenantId = "tenant-1";
  const liveSessionId = "session-1";
  const liveItemId = "item-1";
  const clientPhone = "+33612345678";
  const correlationId = "corr-1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.waitlist.findUnique).mockResolvedValue(null);
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
      return fn(tx as Parameters<Parameters<typeof db.$transaction>[0]>[0]) as Promise<unknown>;
    });
  });

  it("returns existing position when same client+item+session already in waitlist (idempotence)", async () => {
    vi.mocked(db.waitlist.findUnique).mockResolvedValue({
      id: "w1",
      tenantId,
      liveSessionId,
      liveItemId,
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

  // ── Story 8.1: Catalogue item tests ───────────────────

  it("Story 8.1: locks on catalogue_items when options.table = 'catalogue_items'", async () => {
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
      "catalogue", // sentinel liveSessionId
      catItemId,
      clientPhone,
      correlationId,
      { table: "catalogue_items" },
    );

    expect(result).toEqual({ ok: true, position: 1 });
    // Verify lock SQL was called (first $queryRaw call)
    expect(mockTx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mockTx.waitlist.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        liveSessionId: "catalogue",
        liveItemId: catItemId,
        clientPhone,
        position: 1,
        correlationId,
      },
    });
  });

  it("Story 8.1: returns not_found when catalogue item does not exist", async () => {
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
      "catalogue",
      "nonexistent-cat-item",
      clientPhone,
      correlationId,
      { table: "catalogue_items" },
    );

    expect(result).toEqual({ ok: false, reason: "not_found" });
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
    vi.mocked(db.waitlist.findUnique).mockResolvedValue({
      id: "w-race",
      tenantId,
      liveSessionId,
      liveItemId,
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
