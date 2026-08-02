import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockConnectEmbeddedMutateAsync = vi.fn();
/** Enregistrement des identifiants manuels — déclenché par le formulaire. */
const mockSetConfigMutate = vi.fn();
const mockLoadSdk = vi.fn();
/**
 * Le SDK vivant, relu à chaque clic. Il n'est plus retenu dans une référence :
 * le SDK Facebook réassigne `window.FB` à chaque chargement de son script, et
 * appeler une référence capturée plus tôt revenait à parler à un objet périmé —
 * qui n'ouvre rien et ne rappelle jamais.
 */
const mockGetInitializedSdk = vi.fn();
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
  getInitializedMetaSdk: (...args: unknown[]) => mockGetInitializedSdk(...args),
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
        useMutation: () => ({ mutate: mockSetConfigMutate, isPending: false }),
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
    /**
     * `loadMetaEmbeddedSignupSdk` est `async` : elle renvoie toujours une
     * promesse. Un `vi.fn()` nu renvoie `undefined`, ce qui ne correspond à
     * aucun état réel — et faisait échouer le préchargement au montage sur un
     * `undefined.then`. Le défaut est posé ici pour que tous les cas partent
     * d'un mock fidèle ; ceux qui veulent un autre comportement le remplacent.
     */
    mockLoadSdk.mockResolvedValue({ login: vi.fn(), init: vi.fn() });
    // SDK déjà chargé et initialisé : c'est le cas nominal, celui où `FB.login`
    // part dans la tâche du clic et où Meta peut donc ouvrir sa fenêtre.
    mockGetInitializedSdk.mockReturnValue({ login: vi.fn(), init: vi.fn() });
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

  /**
   * ── LES IDENTIFIANTS MANUELS S'ENREGISTRENT PAR SOUMISSION ────────────────
   *
   * Le champ « Access Token » est de type `password` et vivait hors formulaire.
   * Chrome le signalait, à raison : sans formulaire, la touche Entrée n'a aucun
   * effet, alors qu'on vient de saisir trois champs à la suite.
   *
   * L'enveloppant, l'enregistrement dépend désormais de la soumission — et le
   * bouton doit rester en `type="submit"`. Le repasser en `button` sans
   * gestionnaire le rendrait totalement inerte, en silence : c'est ce que ce
   * cas empêche.
   */
  it("enregistre les identifiants à la soumission du formulaire", () => {
    mockWhatsAppConfig.metaPhoneNumberId = "phone-123";
    mockWhatsAppConfig.metaWabaId = "waba-123";
    mockWhatsAppConfig.hasAccessToken = true;

    render(<WhatsAppConfigContent />);

    // Les champs sont verrouillés tant qu'on n'a pas demandé à les modifier.
    fireEvent.click(screen.getByRole("button", { name: "Modifier les identifiants" }));
    fireEvent.click(screen.getByRole("button", { name: "Mettre à jour" }));

    expect(mockSetConfigMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPhoneNumberId: "phone-123",
        metaWabaId: "waba-123",
        // Champ laissé vide : le jeton existant doit être conservé côté serveur.
        metaAccessToken: null,
      }),
    );
  });

  it("laisse le jeton hors des gestionnaires de mots de passe", () => {
    render(<WhatsAppConfigContent />);
    // C'est un secret d'API, pas le mot de passe de la vendeuse : rien à retenir.
    expect(screen.getByLabelText("Access Token")).toHaveAttribute(
      "autocomplete",
      "off",
    );
  });

  /**
   * Condition exacte que Chrome contrôle avant d'émettre « Password field is
   * not contained in a form ». `input.form` est la propriété que le navigateur
   * consulte : la vérifier ici évite d'avoir à ouvrir une page authentifiée
   * pour constater la disparition de l'avertissement.
   */
  it("rattache le champ masqué à un formulaire", () => {
    render(<WhatsAppConfigContent />);
    const token = screen.getByLabelText("Access Token") as HTMLInputElement;
    expect(token.type).toBe("password");
    expect(token.form).not.toBeNull();
  });

  it("n’emploie ni « tenant » ni « E.164 »", () => {
    const { container } = render(<WhatsAppConfigContent />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("tenant");
    expect(text).not.toContain("E.164");
  });

  /**
   * ── LA POPUP TIENT À UN DÉTAIL D'ORDONNANCEMENT ──────────────────────────
   *
   * Un navigateur n'autorise une popup que pendant l'activation utilisateur
   * transitoire : la même tâche que le clic. Le SDK Meta était téléchargé
   * derrière un `await` dans le gestionnaire de clic, si bien qu'au premier clic
   * l'attente couvrait un aller-retour réseau — activation perdue, popup
   * refusée, et Meta basculait sur une redirection pleine page. La vendeuse
   * quittait SnapSell au lieu de voir une fenêtre s'ouvrir.
   *
   * Rien dans le typage ni dans les autres tests n'aurait signalé le retour de
   * cet `await`. Ces deux cas le rendent visible.
   */
  describe("ouverture en popup", () => {
    async function renderWithPreloadedSdk() {
      mockLoadSdk.mockResolvedValue({ login: vi.fn(), init: vi.fn() });
      mockStartSignup.mockResolvedValue({
        status: "connected",
        authResponse: { code: "oauth-789" },
      });
      mockExtractCode.mockReturnValue("oauth-789");
      mockConnectEmbeddedMutateAsync.mockResolvedValue({ ok: true });

      render(<WhatsAppConfigContent />);
      await waitFor(() => expect(mockLoadSdk).toHaveBeenCalledWith("meta-app-id"));
      // Laisse la promesse de préchargement poser la référence du SDK.
      await act(async () => {});
    }

    it("charge le SDK Meta au montage, sans attendre le clic", async () => {
      await renderWithPreloadedSdk();
      expect(mockLoadSdk).toHaveBeenCalledTimes(1);
      expect(mockStartSignup).not.toHaveBeenCalled();
    });

    /**
     * Le cœur du garde-fou : `fireEvent.click` rend la main dès la fin de la
     * portion **synchrone** du gestionnaire. Si l'ouverture Meta a déjà eu lieu
     * à ce moment-là, c'est qu'aucun `await` ne s'est intercalé depuis le clic —
     * donc que l'activation utilisateur est intacte et la popup autorisée.
     */
    it("lance Meta dans la tâche du clic, sans aucune attente intercalée", async () => {
      await renderWithPreloadedSdk();
      mockLoadSdk.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Connecter WhatsApp" }));

      expect(mockStartSignup).toHaveBeenCalledTimes(1);
      // Le SDK préchargé est réutilisé : aucun rechargement, donc aucune attente.
      expect(mockLoadSdk).not.toHaveBeenCalled();

      await waitFor(() => expect(mockConnectEmbeddedMutateAsync).toHaveBeenCalled());
    });

    /**
     * Le préchargement fait charger un script Facebook, qui pose ses propres
     * cookies. Il n'a pas à s'exécuter chez les boutiques qui n'utilisent pas ce
     * parcours.
     */
    it("ne charge rien quand le parcours est désactivé", async () => {
      process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_ENABLED = "false";
      render(<WhatsAppConfigContent />);
      await act(async () => {});
      expect(mockLoadSdk).not.toHaveBeenCalled();
    });

    it("reste utilisable si le préchargement a échoué", async () => {
      // Premier appel : préchargement en échec. Second : le repli du clic.
      mockLoadSdk
        .mockRejectedValueOnce(new Error("réseau indisponible"))
        .mockResolvedValue({ login: vi.fn(), init: vi.fn() });
      mockStartSignup.mockResolvedValue({
        status: "connected",
        authResponse: { code: "oauth-repli" },
      });
      mockExtractCode.mockReturnValue("oauth-repli");
      mockConnectEmbeddedMutateAsync.mockResolvedValue({ ok: true });

      render(<WhatsAppConfigContent />);
      await act(async () => {});

      fireEvent.click(screen.getByRole("button", { name: "Connecter WhatsApp" }));

      // Le parcours aboutit quand même — au prix d'une possible pleine page.
      await waitFor(() =>
        expect(mockConnectEmbeddedMutateAsync).toHaveBeenCalledWith({
          code: "oauth-repli",
        }),
      );
    });
  });
});
