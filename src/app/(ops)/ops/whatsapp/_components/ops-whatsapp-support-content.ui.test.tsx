import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateConfig = vi.hoisted(() => vi.fn());
const mockTestConnection = vi.hoisted(() => vi.fn());
const mockInvalidateDiagnostic = vi.hoisted(() => vi.fn());
const mockInvalidateList = vi.hoisted(() => vi.fn());

const diagnostic = {
  id: "clx1234567890123456789012",
  name: "Boutique Awa",
  ownerEmail: "awa@example.com",
  subscriptionPlan: "PRO",
  phoneNumberId: "phone-123",
  wabaId: "waba-123",
  hasAccessToken: true,
  connected: true,
  coexistence: true,
  historySyncStatus: "completed",
  contactsSyncStatus: "in_progress",
  historySyncAt: new Date("2026-08-12T20:00:00Z"),
  updatedAt: new Date("2026-08-12T21:00:00Z"),
  recentInterventions: [
    {
      id: "event-1",
      eventType: "ops.whatsapp_config_updated",
      actorType: "ops",
      payload: { actorUserId: "ops-1" },
      createdAt: new Date("2026-08-12T21:00:00Z"),
    },
  ],
};

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      ops: {
        whatsapp: {
          diagnostic: { invalidate: mockInvalidateDiagnostic },
          list: { invalidate: mockInvalidateList },
        },
      },
    }),
    ops: {
      whatsapp: {
        list: {
          useQuery: () => ({
            data: [
              {
                id: diagnostic.id,
                name: diagnostic.name,
                ownerEmail: diagnostic.ownerEmail,
                phoneNumberId: diagnostic.phoneNumberId,
                connected: true,
              },
            ],
            isLoading: false,
            error: null,
          }),
        },
        diagnostic: {
          useQuery: () => ({
            data: diagnostic,
            isLoading: false,
            error: null,
          }),
        },
        updateConfig: {
          useMutation: () => ({ mutate: mockUpdateConfig, isPending: false }),
        },
        testConnection: {
          useMutation: () => ({ mutate: mockTestConnection, isPending: false }),
        },
      },
    },
  },
}));

import { OpsWhatsAppSupportContent } from "./ops-whatsapp-support-content";

describe("OpsWhatsAppSupportContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("guide le support vers une boutique sans usurper sa session", () => {
    render(<OpsWhatsAppSupportContent />);

    expect(screen.getByRole("heading", { name: "Support WhatsApp" })).toBeVisible();
    expect(screen.getByLabelText("Rechercher une boutique")).toBeVisible();
    expect(screen.getByText("Sélectionnez une boutique")).toBeVisible();
    expect(screen.queryByText(/se connecter en tant que/i)).not.toBeInTheDocument();
  });

  it("affiche le diagnostic mais jamais le secret enregistré", () => {
    render(<OpsWhatsAppSupportContent />);
    fireEvent.click(screen.getByRole("button", { name: /Boutique Awa/i }));

    expect(screen.getByText("Présent et chiffré")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText("Terminée")).toBeVisible();
    expect(screen.getByText("En cours")).toBeVisible();
    expect(screen.queryByText("secret-never-returned")).not.toBeInTheDocument();
    expect(screen.getByText("Action OPS auditée")).toBeVisible();
  });

  it("permet de tester la connexion depuis la fiche sélectionnée", () => {
    render(<OpsWhatsAppSupportContent />);
    fireEvent.click(screen.getByRole("button", { name: /Boutique Awa/i }));
    fireEvent.click(screen.getByRole("button", { name: "Tester la connexion" }));

    expect(mockTestConnection).toHaveBeenCalledWith({ tenantId: diagnostic.id });
  });

  it("conserve le token existant quand le champ secret reste vide", () => {
    render(<OpsWhatsAppSupportContent />);
    fireEvent.click(screen.getByRole("button", { name: /Boutique Awa/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer la configuration" }),
    );

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      tenantId: diagnostic.id,
      phoneNumberId: "phone-123",
      wabaId: "waba-123",
    });
  });

  it("transmet explicitement un nouveau token sans le réafficher", () => {
    render(<OpsWhatsAppSupportContent />);
    fireEvent.click(screen.getByRole("button", { name: /Boutique Awa/i }));
    fireEvent.change(screen.getByLabelText("Access Token"), {
      target: { value: "new-secret" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer la configuration" }),
    );

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      tenantId: diagnostic.id,
      phoneNumberId: "phone-123",
      wabaId: "waba-123",
      accessToken: "new-secret",
    });
    expect(screen.getByLabelText("Access Token")).toHaveAttribute("type", "password");
  });
});
