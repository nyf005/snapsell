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
      settings: { getWhatsAppConfig: { invalidate: vi.fn() } },
      sellerPhones: { list: { invalidate: vi.fn() } },
    }),
    settings: {
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

describe("WhatsAppConfigContent — embedded signup", () => {
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

  it("renders embedded CTA while keeping manual fallback fields", () => {
    render(<WhatsAppConfigContent />);

    expect(
      screen.getByRole("button", { name: "Connecter WhatsApp Business" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Phone Number ID")).toBeInTheDocument();
    expect(screen.getByLabelText("WABA ID (WhatsApp Business Account)")).toBeInTheDocument();
    expect(screen.getByLabelText("Access Token")).toBeInTheDocument();
  });

  it("shows reconnect CTA and migration info for already connected tenant", () => {
    mockWhatsAppConfig.metaPhoneNumberId = "phone-123";
    mockWhatsAppConfig.metaWabaId = "waba-123";
    mockWhatsAppConfig.metaBusinessPhoneNumber = "+33612345678";
    mockWhatsAppConfig.hasAccessToken = true;

    render(<WhatsAppConfigContent />);

    expect(
      screen.getByRole("button", { name: "Reconnecter via Meta (recommandé)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Reconnexion recommandée")).toBeInTheDocument();
    expect(screen.getByText(/Numéro business actuellement connecté:/i)).toBeInTheDocument();
    expect(screen.getByText("+33612345678")).toBeInTheDocument();
    expect(screen.getByText(/renouvellement automatique du token/i)).toBeInTheDocument();
    expect(screen.getAllByText("Connecté")).toHaveLength(2);
    expect(screen.queryByText("Déconnecté")).not.toBeInTheDocument();
  });

  it("shows reconnect CTA for legacy tenant with phone+token but no wabaId", () => {
    mockWhatsAppConfig.metaPhoneNumberId = "phone-legacy";
    mockWhatsAppConfig.metaWabaId = null;
    mockWhatsAppConfig.hasAccessToken = true;

    render(<WhatsAppConfigContent />);

    expect(
      screen.getByRole("button", { name: "Reconnecter via Meta (recommandé)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Reconnexion recommandée")).toBeInTheDocument();
    expect(screen.getAllByText("Connecté")).toHaveLength(2);
    expect(screen.queryByText("Déconnecté")).not.toBeInTheDocument();
  });

  it("sends OAuth code to backend mutation after successful popup flow", async () => {
    mockLoadSdk.mockResolvedValue({ login: vi.fn(), init: vi.fn() });
    mockStartSignup.mockResolvedValue({ status: "connected", authResponse: { code: "oauth-123" } });
    mockExtractCode.mockReturnValue("oauth-123");
    mockConnectEmbeddedMutateAsync.mockResolvedValue({ ok: true });

    render(<WhatsAppConfigContent />);
    fireEvent.click(screen.getByRole("button", { name: "Connecter WhatsApp Business" }));

    await waitFor(() => {
      expect(mockConnectEmbeddedMutateAsync).toHaveBeenCalledWith({ code: "oauth-123" });
    });
    expect(
      screen.getByText("Code OAuth recu et transmis au backend SnapSell."),
    ).toBeInTheDocument();
  });

  it("forwards embedded signup session identifiers to backend when available", async () => {
    mockLoadSdk.mockResolvedValue({ login: vi.fn(), init: vi.fn() });
    mockStartSignup.mockResolvedValue({
      status: "connected",
      authResponse: { code: "oauth-456" },
      embeddedSignupEvent: {
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH",
        data: {
          waba_id: "waba-456",
          phone_number_id: "phone-456",
        },
      },
    });
    mockExtractCode.mockReturnValue("oauth-456");
    mockConnectEmbeddedMutateAsync.mockResolvedValue({ ok: true });

    render(<WhatsAppConfigContent />);
    fireEvent.click(screen.getByRole("button", { name: "Connecter WhatsApp Business" }));

    await waitFor(() => {
      expect(mockConnectEmbeddedMutateAsync).toHaveBeenCalledWith({
        code: "oauth-456",
        wabaId: "waba-456",
        phoneNumberId: "phone-456",
      });
    });
  });

  it("shows user-facing error when popup is canceled or no code returned", async () => {
    mockLoadSdk.mockResolvedValue({ login: vi.fn(), init: vi.fn() });
    mockStartSignup.mockResolvedValue({ status: "unknown" });
    mockExtractCode.mockReturnValue(null);
    mockErrorMessage.mockReturnValue("Popup fermee avant la fin du flow Meta.");

    render(<WhatsAppConfigContent />);
    fireEvent.click(screen.getByRole("button", { name: "Connecter WhatsApp Business" }));

    expect(
      await screen.findByText("Popup fermee avant la fin du flow Meta."),
    ).toBeInTheDocument();
    expect(mockConnectEmbeddedMutateAsync).not.toHaveBeenCalled();
  });

  it("keeps embedded signup disabled when feature flag is not enabled", () => {
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_ENABLED = "false";

    render(<WhatsAppConfigContent />);
    expect(
      screen.getByRole("button", { name: "Connecter WhatsApp Business" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Embedded Signup est actuellement desactive/i),
    ).toBeInTheDocument();
  });
});
