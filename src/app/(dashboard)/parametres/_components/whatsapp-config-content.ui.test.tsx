import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockConnectEmbeddedMutateAsync = vi.fn();
const mockLoadSdk = vi.fn();
const mockStartSignup = vi.fn();
const mockExtractCode = vi.fn();
const mockErrorMessage = vi.fn();
const mockWhatsAppConfig = {
  metaPhoneNumberId: null as string | null,
  metaWabaId: null as string | null,
  metaBusinessPhoneNumber: null as string | null,
  hasAccessToken: false,
};

vi.mock("~/app/(dashboard)/_components/dashboard-header", () => ({
  DashboardHeader: () => <div data-testid="dashboard-header" />,
}));

vi.mock("~/app/(dashboard)/parametres/_components/meta-embedded-signup-sdk", () => ({
  loadMetaEmbeddedSignupSdk: (...args: unknown[]) => mockLoadSdk(...args),
  startMetaEmbeddedSignup: (...args: unknown[]) => mockStartSignup(...args),
  extractOAuthCodeFromMetaLoginResponse: (...args: unknown[]) => mockExtractCode(...args),
  getMetaEmbeddedSignupErrorMessage: (...args: unknown[]) => mockErrorMessage(...args),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      settings: {
        getWhatsAppConfig: { invalidate: vi.fn() },
        fetchWhatsAppTemplates: { invalidate: vi.fn() },
      },
      sellerPhones: { list: { invalidate: vi.fn() } },
    }),
    settings: {
      // Consommées par WhatsAppAdvancedSections, désormais imbriquée dans la page.
      getBusinessConfig: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
      setBusinessConfig: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      fetchMetaCatalogs: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      selectMetaCatalog: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getWhatsAppConfig: {
        useQuery: () => ({
          data: mockWhatsAppConfig,
          isLoading: false,
        }),
      },
      setWhatsAppConfig: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      testWhatsAppConnection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      connectWhatsAppEmbedded: {
        useMutation: () => ({
          mutateAsync: mockConnectEmbeddedMutateAsync,
          isPending: false,
        }),
      },
      fetchWhatsAppTemplates: {
        useQuery: () => ({
          data: { templates: [], selectedTemplate: null },
          isLoading: false,
          isFetching: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      selectWhatsAppTemplate: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    sellerPhones: {
      list: {
        useQuery: () => ({
          data: [],
          isLoading: false,
        }),
      },
      add: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      remove: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

import { WhatsAppConfigContent } from "./whatsapp-config-content";

describe("WhatsAppConfigContent — chemin unique de connexion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhatsAppConfig.metaPhoneNumberId = null;
    mockWhatsAppConfig.metaWabaId = null;
    mockWhatsAppConfig.metaBusinessPhoneNumber = null;
    mockWhatsAppConfig.hasAccessToken = false;
    process.env.NEXT_PUBLIC_META_APP_ID = "meta-app-id";
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID = "meta-config-id";
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_ENABLED = "true";
  });

  it("propose un seul bouton de connexion à une boutique non connectée", () => {
    render(<WhatsAppConfigContent />);

    expect(screen.getByRole("button", { name: "Connecter WhatsApp" })).toBeEnabled();
    expect(screen.getByText("WhatsApp n’est pas connecté")).toBeInTheDocument();
  });

  it("range les identifiants Meta derrière « Configuration avancée »", () => {
    render(<WhatsAppConfigContent />);

    const disclosure = screen.getByText("Configuration avancée").closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    // Les champs existent toujours pour le dépannage, mais repliés.
    expect(disclosure).toContainElement(screen.getByLabelText("Phone Number ID"));
    expect(disclosure).toContainElement(screen.getByLabelText("Access Token"));
  });

  it("affiche le numéro connecté et propose de tester", () => {
    mockWhatsAppConfig.metaPhoneNumberId = "phone-123";
    mockWhatsAppConfig.metaWabaId = "waba-123";
    mockWhatsAppConfig.metaBusinessPhoneNumber = "+2250701020304";
    mockWhatsAppConfig.hasAccessToken = true;

    render(<WhatsAppConfigContent />);

    expect(screen.getByText("WhatsApp est connecté")).toBeInTheDocument();
    expect(screen.getByText(/\+2250701020304/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tester la connexion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnecter" })).toBeInTheDocument();
  });

  it("transmet le code OAuth au serveur après le popup", async () => {
    mockLoadSdk.mockResolvedValue({ login: vi.fn(), init: vi.fn() });
    mockStartSignup.mockResolvedValue({
      status: "connected",
      authResponse: { code: "oauth-123" },
    });
    mockExtractCode.mockReturnValue("oauth-123");
    mockConnectEmbeddedMutateAsync.mockResolvedValue({ ok: true });

    render(<WhatsAppConfigContent />);
    fireEvent.click(screen.getByRole("button", { name: "Connecter WhatsApp" }));

    await waitFor(() => {
      expect(mockConnectEmbeddedMutateAsync).toHaveBeenCalledWith({ code: "oauth-123" });
    });
    // Le message de succès parle à la vendeuse, pas du backend ni d'OAuth.
    expect(
      screen.getByText("WhatsApp est connecté. Votre clientèle peut vous écrire."),
    ).toBeInTheDocument();
  });

  it("transmet les identifiants de session Meta quand ils sont fournis", async () => {
    mockLoadSdk.mockResolvedValue({ login: vi.fn(), init: vi.fn() });
    mockStartSignup.mockResolvedValue({
      status: "connected",
      authResponse: { code: "oauth-456" },
      embeddedSignupEvent: {
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH",
        data: { waba_id: "waba-456", phone_number_id: "phone-456" },
      },
    });
    mockExtractCode.mockReturnValue("oauth-456");
    mockConnectEmbeddedMutateAsync.mockResolvedValue({ ok: true });

    render(<WhatsAppConfigContent />);
    fireEvent.click(screen.getByRole("button", { name: "Connecter WhatsApp" }));

    await waitFor(() => {
      expect(mockConnectEmbeddedMutateAsync).toHaveBeenCalledWith({
        code: "oauth-456",
        wabaId: "waba-456",
        phoneNumberId: "phone-456",
      });
    });
  });

  it("explique l’échec sans exposer la cause technique", async () => {
    mockLoadSdk.mockResolvedValue({ login: vi.fn(), init: vi.fn() });
    mockStartSignup.mockResolvedValue({ status: "unknown" });
    mockExtractCode.mockReturnValue(null);
    mockErrorMessage.mockReturnValue("Popup closed before OAuth completion");

    render(<WhatsAppConfigContent />);
    fireEvent.click(screen.getByRole("button", { name: "Connecter WhatsApp" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    // Le texte brut de Meta ne doit pas atteindre la vendeuse.
    for (const alert of alerts) {
      expect(alert.textContent).not.toContain("Popup closed before OAuth completion");
    }
    expect(mockConnectEmbeddedMutateAsync).not.toHaveBeenCalled();
  });

  it("n’affiche jamais de nom de variable d’environnement", () => {
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_ENABLED = "false";
    const { container } = render(<WhatsAppConfigContent />);

    fireEvent.click(screen.getByRole("button", { name: "Connecter WhatsApp" }));

    const text = container.textContent ?? "";
    expect(text).not.toContain("NEXT_PUBLIC_");
    expect(text).not.toContain("BSP");
    expect(text).not.toContain("Tech Provider");
    expect(text).not.toContain("backend");
  });

  it("n’emploie ni « tenant » ni « E.164 »", () => {
    const { container } = render(<WhatsAppConfigContent />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("tenant");
    expect(text).not.toContain("E.164");
  });
});
