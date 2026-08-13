import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateConfig = vi.hoisted(() => vi.fn());
const mockTestConnection = vi.hoisted(() => vi.fn());
const mockRetryHistorySync = vi.hoisted(() => vi.fn());
const mockPauseAssistant = vi.hoisted(() => vi.fn());
const mockInvalidateDiagnostic = vi.hoisted(() => vi.fn());
const mockInvalidateList = vi.hoisted(() => vi.fn());
const mutationCallbacks = vi.hoisted(() => ({
  test: null as null | { onSuccess?: () => void; onError?: (error: Error) => void },
  retry: null as null | { onSuccess?: () => void; onError?: (error: Error) => void },
}));

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
  contactsSyncStatus: "completed",
  historySyncAt: new Date("2026-08-12T20:00:00Z"),
  updatedAt: new Date("2026-08-12T21:00:00Z"),
  assistant: {
    enabled: false,
    state: "paused",
    connected: true,
    ready: true,
    blockers: [],
    warnings: [],
    sellableItemCount: 3,
    updatedAt: null,
    updatedBy: null,
    activatedAt: null,
  },
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
          useMutation: (callbacks: typeof mutationCallbacks.test) => {
            mutationCallbacks.test = callbacks;
            return { mutate: mockTestConnection, isPending: false };
          },
        },
        retryHistorySync: {
          useMutation: (callbacks: typeof mutationCallbacks.retry) => {
            mutationCallbacks.retry = callbacks;
            return { mutate: mockRetryHistorySync, isPending: false };
          },
        },
        pauseAssistant: {
          useMutation: () => ({ mutate: mockPauseAssistant, isPending: false }),
        },
      },
    },
  },
}));

import { OpsWhatsAppSupportContent } from "./ops-whatsapp-support-content";

function selectBoutique() {
  fireEvent.click(screen.getByRole("button", { name: /Boutique Awa/i }));
}

function chooseIssue(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("OpsWhatsAppSupportContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationCallbacks.test = null;
    mutationCallbacks.retry = null;
    mockInvalidateDiagnostic.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("guide le support vers une boutique sans usurper sa session", () => {
    render(<OpsWhatsAppSupportContent />);

    expect(
      screen.getByRole("heading", { name: "Assistance WhatsApp" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Rechercher une boutique")).toBeVisible();
    expect(screen.getByText("Sélectionnez une boutique")).toBeVisible();
    expect(screen.queryByText(/se connecter en tant que/i)).not.toBeInTheDocument();
  });

  it("commence par le problème métier et garde le jargon replié", () => {
    render(<OpsWhatsAppSupportContent />);
    selectBoutique();

    expect(
      screen.getByRole("group", {
        name: "Quel problème rencontre la boutique ?",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Connexion WhatsApp impossible/i }),
    ).toBeVisible();
    expect(screen.getByText("Détails techniques")).toBeVisible();
    expect(screen.queryByText("secret-never-returned")).not.toBeInTheDocument();
  });

  it("teste Meta avant de proposer la solution à un problème de connexion", async () => {
    render(<OpsWhatsAppSupportContent />);
    selectBoutique();
    chooseIssue(/Connexion WhatsApp impossible/i);
    fireEvent.click(screen.getByRole("button", { name: "Lancer le diagnostic" }));

    expect(mockTestConnection).toHaveBeenCalledWith({ tenantId: diagnostic.id });
    mutationCallbacks.test?.onSuccess?.();

    expect(
      await screen.findByRole("heading", {
        name: "WhatsApp est déjà connecté à SnapSell",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Copier la confirmation" })).toBeVisible();
  });

  it("explique une reprise terminée sans appeler Meta inutilement", () => {
    render(<OpsWhatsAppSupportContent />);
    selectBoutique();
    chooseIssue(/Historique ou contacts absents/i);
    fireEvent.click(screen.getByRole("button", { name: "Lancer le diagnostic" }));

    expect(
      screen.getByRole("heading", { name: "La reprise est terminée" }),
    ).toBeVisible();
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it("copie un message prêt à envoyer à la boutique", async () => {
    render(<OpsWhatsAppSupportContent />);
    selectBoutique();
    chooseIssue(/Historique ou contacts absents/i);
    fireEvent.click(screen.getByRole("button", { name: "Lancer le diagnostic" }));
    fireEvent.click(screen.getByRole("button", { name: "Copier la confirmation" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("la reprise de vos anciennes conversations"),
      ),
    );
    expect(
      screen.getByText(
        "Message copié. Vous pouvez maintenant l’envoyer à la boutique.",
      ),
    ).toBeVisible();
  });

  it("conserve le token existant quand le champ secret reste vide", () => {
    render(<OpsWhatsAppSupportContent />);
    selectBoutique();
    fireEvent.click(screen.getByText("Détails techniques"));
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
    selectBoutique();
    fireEvent.click(screen.getByText("Détails techniques"));
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
