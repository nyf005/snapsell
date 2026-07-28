import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "../../../generated/prisma";
import { writeToOutbox } from "./outbox";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { boss, QUEUE } from "~/server/workers/queues";

// Mock db
vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findUnique: vi.fn(),
    },
    messageOut: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock queues (pg-boss)
vi.mock("~/server/workers/queues", () => ({
  boss: { send: vi.fn().mockResolvedValue("job-id-mock") },
  QUEUE: { OUTBOX_SEND: "outbox-send" },
}));

vi.mock("~/env", () => ({
  env: {
    QSTASH_TOKEN: "",
    NEXT_PUBLIC_APP_URL: "",
  },
}));

describe("writeToOutbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.tenant.findUnique).mockResolvedValue({ name: "La Boutique", showBranding: false } as never);
  });

  it("should write MessageOut with status pending", async () => {
    const message = {
      tenantId: "tenant-123",
      to: "+33612345678",
      body: "Hello World",
      correlationId: "corr-123",
    };

    const mockMessageOut = {
      id: "msg-out-123",
      tenantId: message.tenantId,
      to: message.to,
      body: message.body,
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
      createdAt: new Date(),
    };

    vi.mocked(db.messageOut.create).mockResolvedValue(mockMessageOut as never);

    const result = await writeToOutbox(message);

    expect(db.messageOut.create).toHaveBeenCalledWith({
      data: {
        tenantId: message.tenantId,
        to: message.to,
        body: "Hello World\n\n_La Boutique_",
        mediaUrl: null,
        interactivePayload: undefined,
        isTypingIndicator: false,
        status: "pending",
        attempts: 0,
        correlationId: message.correlationId,
      },
      select: {
        id: true,
        tenantId: true,
        to: true,
        body: true,
        status: true,
        attempts: true,
        correlationId: true,
        createdAt: true,
      },
    });

    expect(result).toMatchObject({
      id: "msg-out-123",
      tenantId: message.tenantId,
      to: message.to,
      body: message.body,
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
    });

    // AC6: boss.send() appelé après create pour enqueue immédiat
    expect(boss.send).toHaveBeenCalledWith(
      QUEUE.OUTBOX_SEND,
      { messageOutId: "msg-out-123" },
      { singletonKey: "msg-out-123" },
    );
  });

  it("Story 9.4: should persist mediaUrl when provided", async () => {
    const message = {
      tenantId: "tenant-123",
      to: "+33612345678",
      body: "Récap",
      correlationId: "corr-media",
      mediaUrl: "tenants/t1/catalogue-items/ci1/photo",
    };

    const mockMessageOut = {
      id: "msg-out-media",
      tenantId: message.tenantId,
      to: message.to,
      body: message.body,
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
      createdAt: new Date(),
    };

    vi.mocked(db.messageOut.create).mockResolvedValue(mockMessageOut as never);

    await writeToOutbox(message);

    expect(db.messageOut.create).toHaveBeenCalledWith({
      data: {
        tenantId: message.tenantId,
        to: message.to,
        body: "Récap\n\n_La Boutique_",
        mediaUrl: "tenants/t1/catalogue-items/ci1/photo",
        interactivePayload: undefined,
        isTypingIndicator: false,
        status: "pending",
        attempts: 0,
        correlationId: message.correlationId,
      },
      select: {
        id: true,
        tenantId: true,
        to: true,
        body: true,
        status: true,
        attempts: true,
        correlationId: true,
        createdAt: true,
      },
    });
  });

  it("should validate message with Zod", async () => {
    const invalidMessage = {
      tenantId: "", // Invalid: empty string
      to: "+33612345678",
      body: "Hello",
      correlationId: "corr-123",
    };

    await expect(writeToOutbox(invalidMessage as never)).rejects.toThrow();
    expect(db.messageOut.create).not.toHaveBeenCalled();
  });

  it("AC6: should succeed even if boss.send() fails (MessageOut remains pending)", async () => {
    const message = {
      tenantId: "tenant-123",
      to: "+33612345678",
      body: "Hello",
      correlationId: "corr-resilient",
    };

    const mockMessageOut = {
      id: "msg-out-resilient",
      tenantId: message.tenantId,
      to: message.to,
      body: message.body,
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
      createdAt: new Date(),
    };

    vi.mocked(db.messageOut.create).mockResolvedValue(mockMessageOut as never);
    vi.mocked(boss.send).mockRejectedValueOnce(new Error("pg-boss connection failed"));

    const result = await writeToOutbox(message);

    // MessageOut créé malgré l'échec de boss.send()
    expect(result.id).toBe("msg-out-resilient");
    expect(result.status).toBe("pending");
    expect(db.messageOut.create).toHaveBeenCalled();
  });

  it("should throw error if DB create fails", async () => {
    const message = {
      tenantId: "tenant-123",
      to: "+33612345678",
      body: "Hello World",
      correlationId: "corr-123",
    };

    const dbError = new Error("DB error");
    vi.mocked(db.messageOut.create).mockRejectedValue(dbError);

    await expect(writeToOutbox(message)).rejects.toThrow("DB error");
  });

  describe("idempotence sur conflit unique (tenantId, correlationId, to)", () => {
    /**
     * Simule la violation de contrainte unique remontée par Prisma.
     * On reproduit la forme de l'erreur plutôt que d'importer le vrai constructeur,
     * afin de rester indépendant de la version du client généré.
     */
    function uniqueViolation(): Error {
      const err = Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Error & {
        code: string;
        meta: unknown;
        clientVersion: string;
      };
      err.message = "Unique constraint failed";
      err.code = "P2002";
      err.meta = { target: ["tenant_id", "correlation_id", "to"] };
      err.clientVersion = "test";
      return err;
    }

    const message = {
      tenantId: "tenant-123",
      to: "+33612345678",
      body: "Ta réservation est confirmée",
      correlationId: "corr-retry",
    };

    const existing = {
      id: "msg-out-existing",
      tenantId: message.tenantId,
      to: message.to,
      body: `${message.body}\n\n_La Boutique_`, // le footer est injecté par writeToOutbox
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
      createdAt: new Date(),
    };

    it("ne relance pas l'erreur et retourne le message déjà écrit (rejeu de job)", async () => {
      vi.mocked(db.messageOut.create).mockRejectedValue(uniqueViolation());
      vi.mocked(db.messageOut.findUnique).mockResolvedValue(existing as never);

      const result = await writeToOutbox(message);

      // Le job peut se terminer : c'est ce qui permet au retry pg-boss d'aboutir
      // au lieu d'échouer indéfiniment sur le message déjà présent.
      expect(result.id).toBe("msg-out-existing");
      expect(db.messageOut.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_correlationId_to: {
              tenantId: message.tenantId,
              correlationId: message.correlationId,
              to: message.to,
            },
          },
        }),
      );
    });

    it("ne ré-enqueue pas le message déjà en file", async () => {
      vi.mocked(db.messageOut.create).mockRejectedValue(uniqueViolation());
      vi.mocked(db.messageOut.findUnique).mockResolvedValue(existing as never);

      await writeToOutbox(message);

      expect(boss.send).not.toHaveBeenCalled();
    });

    it("journalise en erreur si un message DIFFÉRENT existe déjà (défaut de flux)", async () => {
      vi.mocked(db.messageOut.create).mockRejectedValue(uniqueViolation());
      vi.mocked(db.messageOut.findUnique).mockResolvedValue({
        ...existing,
        body: "Un tout autre message",
      } as never);

      const result = await writeToOutbox(message);

      expect(result.id).toBe("msg-out-existing");
      expect(workerLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Outbox conflict"),
        undefined,
        expect.objectContaining({ correlationId: message.correlationId }),
      );
    });

    it("relance l'erreur si le message en conflit est introuvable", async () => {
      vi.mocked(db.messageOut.create).mockRejectedValue(uniqueViolation());
      vi.mocked(db.messageOut.findUnique).mockResolvedValue(null as never);

      await expect(writeToOutbox(message)).rejects.toThrow("Unique constraint failed");
    });
  });

  it("preserves CI WhatsApp recipient without implicit migration", async () => {
    const message = {
      tenantId: "tenant-123",
      to: "+22509542783",
      body: "Hello CI",
      correlationId: "corr-ci",
    };

    const mockMessageOut = {
      id: "msg-out-ci",
      tenantId: message.tenantId,
      to: message.to,
      body: message.body,
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
      createdAt: new Date(),
    };

    vi.mocked(db.messageOut.create).mockResolvedValue(mockMessageOut as never);

    await writeToOutbox(message);

    expect(db.messageOut.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          to: "+22509542783",
        }),
      }),
    );
  });
});
