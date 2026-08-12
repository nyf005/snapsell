"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Eye, EyeOff, Info, KeyRound, Phone, Plus, Trash2 } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import {
  type MetaEmbeddedSignupEvent,
  type MetaSignupMode,
  extractOAuthCodeFromMetaLoginResponse,
  getInitializedMetaSdk,
  getMetaEmbeddedSignupErrorMessage,
  loadMetaEmbeddedSignupSdk,
  startMetaEmbeddedSignup,
} from "~/app/(dashboard)/parametres/_components/meta-embedded-signup-sdk";
import {
  Alert,
  AlertDescription,
} from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";
import { WhatsAppAdvancedSections } from "./whatsapp-business-config-content";
import { ErrorAlert } from "~/components/ui/error-alert";
import { errorCopy, formatError, ui, type UserError } from "~/lib/copy";

/**
 * Délai au-delà duquel on considère que la fenêtre Meta ne s'est pas ouverte.
 *
 * Elle apparaît en une seconde ou deux quand tout va bien — ce qui suit prend
 * plusieurs minutes, mais se passe *dans* cette fenêtre, pas ici. Douze secondes
 * laissent donc largement le temps à une ouverture lente sans faire attendre
 * devant un bouton qui ne bougera plus.
 */
const EMBEDDED_SIGNUP_SLOW_HINT_MS = 12_000;

export function WhatsAppConfigContent() {
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaWabaId, setMetaWabaId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saveError, setSaveError] = useState<UserError | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testError, setTestError] = useState<UserError | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newSellerPhone, setNewSellerPhone] = useState("");
  const [sellerPhoneError, setSellerPhoneError] = useState<UserError | null>(null);
  const [embeddedSignupState, setEmbeddedSignupState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [embeddedSignupError, setEmbeddedSignupError] = useState<UserError | null>(null);
  const [historySyncError, setHistorySyncError] = useState<UserError | null>(null);
  /**
   * ── UNE ATTENTE NE DOIT JAMAIS ÊTRE UNE IMPASSE ─────────────────────────────
   *
   * Le bouton se désactivait au clic et le restait tant que Meta n'avait pas
   * répondu. Quand Meta n'ouvrait rien du tout — ce qui est arrivé — la vendeuse
   * se retrouvait devant « Ouverture de WhatsApp… » indéfiniment, sans message,
   * sans erreur, sans autre issue que recharger la page. Elle n'avait aucun
   * moyen de savoir s'il fallait patienter ou renoncer.
   *
   * Passé un court délai, on le dit et on rend la main. La tentative en cours
   * n'est pas annulée pour autant : si Meta finit par répondre, le parcours
   * aboutit normalement.
   */
  const [embeddedSignupSlow, setEmbeddedSignupSlow] = useState(false);
  /**
   * Numéro de la tentative en cours. Rendre le bouton cliquable rouvre la
   * possibilité d'en lancer une seconde ; sans ce compteur, la première —
   * toujours en vol — écraserait le résultat de la seconde en retombant.
   */
  const signupRunRef = useRef(0);

  const utils = api.useUtils();
  /**
   * ── UNE REPRISE EN COURS DOIT AVANCER SOUS LES YEUX ─────────────────────
   *
   * L'état n'était relu qu'après la connexion. Une boutique restant sur la page
   * voyait donc « en cours » indéfiniment, même une fois la reprise terminée —
   * elle n'avait aucune raison de deviner qu'il fallait recharger.
   *
   * On n'interroge que pendant la reprise, et pas au-delà : inutile de tenir
   * une requête toutes les dix secondes sur une page ouverte toute la journée.
   */
  const { data, isLoading } = api.settings.getWhatsAppConfig.useQuery(undefined, {
    refetchInterval: (query) => {
      const status = query.state.data?.historySyncStatus;
      return status === "requested" || status === "in_progress" ? 10_000 : false;
    },
  });
  const { data: sellerPhones = [], isLoading: sellerPhonesLoading } =
    api.sellerPhones.list.useQuery();
  const addSellerPhone = api.sellerPhones.add.useMutation({
    onSuccess: () => {
      setSellerPhoneError(null);
      setNewSellerPhone("");
      void utils.sellerPhones.list.invalidate();
    },
    onError: (e) => setSellerPhoneError(formatError(e, "whatsapp")),
  });
  const removeSellerPhone = api.sellerPhones.remove.useMutation({
    onSuccess: () => void utils.sellerPhones.list.invalidate(),
  });

  const testConnection = api.settings.testWhatsAppConnection.useMutation({
    onSuccess: () => {
      setTestError(null);
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 4000);
    },
    onError: (e) => setTestError(formatError(e, "whatsapp")),
  });

  const setConfig = api.settings.setWhatsAppConfig.useMutation({
    onSuccess: () => {
      setSaveError(null);
      setSaveSuccess(true);
      setIsEditing(false);
      void utils.settings.getWhatsAppConfig.invalidate();
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (e) => setSaveError(formatError(e, "whatsapp")),
  });
  const retryHistorySync = api.settings.retryHistorySync.useMutation({
    onSuccess: () => void utils.settings.getWhatsAppConfig.invalidate(),
    onError: (e) => setHistorySyncError(formatError(e, "whatsapp")),
  });
  const connectEmbedded = api.settings.connectWhatsAppEmbedded.useMutation({
    onSuccess: () => {
      void utils.settings.getWhatsAppConfig.invalidate();
    },
  });

  const serverPhoneNumberId = data?.metaPhoneNumberId ?? null;
  const serverWabaId = data?.metaWabaId ?? null;
  const serverBusinessPhoneNumber = data?.metaBusinessPhoneNumber ?? null;
  const serverHasToken = data?.hasAccessToken ?? false;
  const canShowReconnect =
    serverPhoneNumberId != null && serverPhoneNumberId !== "" && serverHasToken;

  const isConnected =
    canShowReconnect &&
    serverWabaId != null && serverWabaId !== "" &&
    serverHasToken;

  const isLocked = isConnected && !isEditing;

  const hasInitialSync = useRef(false);

  const hydrateFromServer = useCallback(() => {
    setMetaPhoneNumberId(serverPhoneNumberId ?? "");
    setMetaWabaId(serverWabaId ?? "");
    setMetaAccessToken("");
  }, [serverPhoneNumberId, serverWabaId]);

  useEffect(() => {
    if (data === undefined || hasInitialSync.current) return;
    hasInitialSync.current = true;
    hydrateFromServer();
  }, [data, hydrateFromServer]);

  const handleSave = useCallback(() => {
    const phoneId = metaPhoneNumberId.trim();
    const wabaId = metaWabaId.trim();
    const token = metaAccessToken.trim();
    setConfig.mutate({
      metaPhoneNumberId: phoneId === "" ? null : phoneId,
      metaWabaId: wabaId === "" ? null : wabaId,
      // null = pas de changement côté backend (le token existant est conservé)
      metaAccessToken: token === "" ? null : token,
    });
  }, [metaPhoneNumberId, metaWabaId, metaAccessToken, setConfig]);

  const handleCancel = useCallback(() => {
    hydrateFromServer();
    setSaveError(null);
    setIsEditing(false);
  }, [hydrateFromServer]);

  const handleAddSellerPhone = useCallback(() => {
    const value = newSellerPhone.trim();
    if (!value) return;
    setSellerPhoneError(null);
    addSellerPhone.mutate({ phoneNumber: value });
  }, [newSellerPhone, addSellerPhone]);

  const PLACEHOLDER = "+33612345678";
  const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
  const metaEmbeddedConfigId =
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID ?? "";
  const isEmbeddedSignupEnabled =
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_ENABLED === "true";
  /**
   * La Coexistence dépend de deux choses que SnapSell ne contrôle pas : le
   * statut Tech Provider de l'app Meta, et la disponibilité du parcours dans le
   * pays du numéro. Tant que ce n'est pas confirmé sur un vrai numéro, le
   * drapeau laisse livrer le code sans exposer un choix qui échouerait.
   */
  const isCoexistenceEnabled =
    isEmbeddedSignupEnabled &&
    process.env.NEXT_PUBLIC_META_COEXISTENCE_ENABLED === "true";

  /*
    `embeddedSignupSlow` rouvre les boutons : passé le délai, on cesse de retenir
    la personne devant une fenêtre qui ne s'ouvrira pas. L'envoi du code au
    serveur, lui, reste bloquant — c'est une écriture, on ne la relance pas.
  */
  const signupBusy =
    (embeddedSignupState === "loading" && !embeddedSignupSlow) ||
    connectEmbedded.isPending;

  /**
   * Ce que la boutique doit lire sur la reprise de ses conversations.
   *
   * `declined` n'est pas une panne : elle a refusé le partage dans la fenêtre
   * Meta, et le dire évite qu'elle cherche un défaut inexistant. `failed`, si —
   * et comme la fenêtre de Meta est de 24 h, il faut le voir vite.
   */
  const historySyncNotice = (() => {
    if (!data?.coexistence) return null;
    switch (data.historySyncStatus) {
      case "requested":
      case "in_progress":
        return "Reprise de vos anciennes conversations en cours. Elles apparaissent par tranches, comptez plusieurs minutes.";
      case "completed":
        return "Vos anciennes conversations ont été reprises.";
      case "declined":
        return "Vos anciennes conversations n’ont pas été reprises : le partage a été refusé pendant la connexion. Tout le reste fonctionne normalement.";
      case "failed":
        return "La reprise de vos anciennes conversations n’a pas pu démarrer. Les nouveaux messages arrivent normalement.";
      default:
        return null;
    }
  })();

  /** Même progression d'état sur tous les boutons de connexion. */
  const signupButtonLabel = (idleLabel: string) =>
    connectEmbedded.isPending
      ? "Connexion en cours…"
      : embeddedSignupState === "loading" && !embeddedSignupSlow
        ? "Ouverture de WhatsApp…"
        : embeddedSignupSlow
          ? "Réessayer"
          : idleLabel;

  /**
   * ── LE SDK META SE CHARGE ICI, PAS AU CLIC ────────────────────────────────
   *
   * Il était téléchargé depuis le gestionnaire de clic, derrière un `await`. Au
   * premier clic, cette attente couvrait donc un aller-retour réseau : le
   * navigateur considérait l'activation utilisateur comme expirée, refusait la
   * popup, et le SDK Meta basculait sur une redirection pleine page. La vendeuse
   * quittait SnapSell au lieu de voir une fenêtre s'ouvrir par-dessus.
   *
   * En le chargeant au montage, `sdk.login()` s'exécute dans la même tâche que
   * le clic et la popup est autorisée. C'est aussi ce que prescrit la
   * documentation Meta.
   *
   * Le chargement est conditionné à une configuration complète : sans cela, on
   * ferait charger un script Facebook — qui pose ses propres cookies — à toute
   * personne ouvrant cette page, y compris dans les boutiques qui n'utilisent
   * pas ce parcours.
   */
  /**
   * Marque un préchargement déjà lancé — **pas** l'objet SDK.
   *
   * Retenir l'objet était le défaut : le SDK réassigne `window.FB` à chaque
   * chargement de son script, et une référence capturée ici pouvait désigner un
   * objet périmé qu'on appelait ensuite dans le vide. Le SDK vivant se lit au
   * moment du clic ; ce drapeau ne sert qu'à ne pas relancer le chargement.
   */
  const metaSdkPreloadedRef = useRef(false);

  useEffect(() => {
    if (!isEmbeddedSignupEnabled) return;
    if (!metaAppId.trim() || !metaEmbeddedConfigId.trim()) return;
    if (metaSdkPreloadedRef.current) return;

    let cancelled = false;
    void loadMetaEmbeddedSignupSdk(metaAppId)
      .then(() => {
        if (!cancelled) metaSdkPreloadedRef.current = true;
      })
      .catch((error: unknown) => {
        // Un échec de préchargement n'est pas une erreur à montrer : le clic
        // retentera le chargement (cf. repli dans `handleEmbeddedSignup`), et
        // rien n'est encore demandé à ce stade.
        console.error("[whatsapp] préchargement du SDK Meta échoué", error);
      });

    return () => {
      cancelled = true;
    };
  }, [isEmbeddedSignupEnabled, metaAppId, metaEmbeddedConfigId]);

  const handleEmbeddedSignup = useCallback(async (mode: MetaSignupMode) => {
    const runId = ++signupRunRef.current;
    /** Vrai tant que cette tentative-ci est la plus récente. */
    const isCurrentRun = () => signupRunRef.current === runId;

    setEmbeddedSignupError(null);
    setEmbeddedSignupState("loading");
    setEmbeddedSignupSlow(false);

    const slowHintTimer = window.setTimeout(() => {
      if (isCurrentRun()) setEmbeddedSignupSlow(true);
    }, EMBEDDED_SIGNUP_SLOW_HINT_MS);

    // Ces trois cas sont des erreurs de configuration de SnapSell, pas de la
    // vendeuse : elle ne peut rien y faire et n'a pas à lire des noms de variables
    // d'environnement. On affiche une indisponibilité et on trace la cause réelle.
    const misconfiguration = !isEmbeddedSignupEnabled
      ? "embedded signup disabled"
      : !metaAppId.trim()
        ? "missing NEXT_PUBLIC_META_APP_ID"
        : !metaEmbeddedConfigId.trim()
          ? "missing NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID"
          : null;

    if (misconfiguration) {
      console.error(`[whatsapp] embedded signup indisponible: ${misconfiguration}`);
      window.clearTimeout(slowHintTimer);
      setEmbeddedSignupSlow(false);
      setEmbeddedSignupState("error");
      setEmbeddedSignupError(errorCopy["whatsapp.unavailable"]!);
      return;
    }

    try {
      /**
       * Aucune attente avant `startMetaEmbeddedSignup` sur le chemin nominal :
       * c'est ce qui permet à `FB.login()` de s'exécuter dans la tâche du clic
       * et donc d'ouvrir une popup plutôt que de rediriger la page entière.
       *
       * Le repli couvre les deux cas où le SDK n'est pas encore là : un clic
       * pendant le préchargement, ou un préchargement en échec. On charge alors
       * puis on lance quand même — la popup sera peut-être refusée et Meta
       * basculera en pleine page, ce qui reste très préférable à un bouton sans
       * effet. C'est le comportement d'avant ce correctif, conservé comme filet.
       */
      /**
       * ── ON LIT `window.FB` MAINTENANT, ON NE LE RETIENT PAS ────────────────
       *
       * Le SDK préchargé était conservé dans une référence, et c'est elle qu'on
       * appelait au clic. C'était faux : le SDK Facebook **réassigne
       * `window.FB`** à chaque chargement de son script. Une référence capturée
       * au montage peut donc désigner un objet périmé — celui d'une balise
       * retirée du DOM — pendant que le SDK vivant est ailleurs.
       *
       * Appeler l'objet périmé n'a aucun effet visible : pas de fenêtre, pas
       * d'erreur, pas de rappel. C'est exactement le symptôme qu'on a chassé,
       * et il a en prime faussé le diagnostic, une sonde posée sur
       * `window.FB.login` n'observant pas l'objet réellement appelé.
       *
       * Lire la valeur vivante au moment du clic supprime la classe entière de
       * ce défaut. Le préchargement garde tout son rôle — charger le script tôt
       * pour que l'appel reste dans la tâche du clic — mais il ne décide plus
       * *quel* objet on appelle.
       * ──────────────────────────────────────────────────────────────────────
       */
      const liveSdk = getInitializedMetaSdk(metaAppId);
      let loginResponse;
      if (liveSdk) {
        loginResponse = await startMetaEmbeddedSignup(liveSdk, metaEmbeddedConfigId, mode);
      } else {
        /*
          Ce chemin est dégradé et doit se voir : l'attente ci-dessous fait
          perdre l'activation utilisateur, donc Meta n'ouvrira pas de fenêtre
          par-dessus. Sans cette trace, rien ne distingue « le préchargement
          n'avait pas fini » de « le SDK a échoué » quand on dépanne.
        */
        console.warn(
          "[whatsapp] SDK Meta non préchargé au moment du clic — ouverture dégradée",
        );
        await loadMetaEmbeddedSignupSdk(metaAppId);
        metaSdkPreloadedRef.current = true;
        // Même règle qu'au-dessus : on relit le SDK vivant après le chargement
        // plutôt que d'utiliser la valeur retournée, qui peut déjà être périmée
        // si un second chargement du script est intervenu entre-temps.
        const sdk = getInitializedMetaSdk(metaAppId);
        if (!sdk) {
          throw new Error("SDK Meta indisponible après chargement.");
        }
        loginResponse = await startMetaEmbeddedSignup(sdk, metaEmbeddedConfigId, mode);
      }

      const code = extractOAuthCodeFromMetaLoginResponse(loginResponse);

      if (!code) {
        throw new Error(
          getMetaEmbeddedSignupErrorMessage(
            loginResponse,
            "Aucun code OAuth recu depuis Meta. Veuillez reessayer.",
          ),
        );
      }

      const embeddedSignupEvent = loginResponse?.embeddedSignupEvent as
        | MetaEmbeddedSignupEvent
        | undefined;

      await connectEmbedded.mutateAsync({
        code,
        ...(embeddedSignupEvent?.data?.waba_id
          ? { wabaId: embeddedSignupEvent.data.waba_id }
          : {}),
        ...(embeddedSignupEvent?.data?.phone_number_id
          ? { phoneNumberId: embeddedSignupEvent.data.phone_number_id }
          : {}),
      });
      if (!isCurrentRun()) return;
      setEmbeddedSignupState("success");
    } catch (error) {
      /**
       * ── LA CAUSE RÉELLE PART DANS LA CONSOLE, PAS SEULEMENT À L'ÉCRAN ──────
       *
       * Ce bloc ne faisait que traduire l'erreur en message pour la vendeuse.
       * C'est ce qu'il faut lui montrer — mais la cause technique disparaissait
       * alors totalement : ni trace, ni pile d'appels, rien.
       *
       * Ce silence a coûté cher. En diagnostiquant une connexion WhatsApp qui
       * n'aboutissait pas, tout indiquait que le SDK Meta n'était jamais appelé,
       * sans qu'aucun relevé ne dise pourquoi — parce qu'une exception levée
       * avant l'appel produisait exactement ces symptômes, en silence.
       *
       * Le message à l'écran reste inchangé : il s'adresse à la vendeuse, qui
       * n'a que faire d'une pile d'appels. Celle-ci part dans la console, où la
       * cherchera quelqu'un qui dépanne.
       * ──────────────────────────────────────────────────────────────────────
       */
      console.error("[whatsapp] échec de la connexion Meta", error);

      // Une tentative dépassée qui retombe ne doit pas effacer le résultat de
      // celle qui l'a remplacée.
      if (!isCurrentRun()) return;
      setEmbeddedSignupError(formatError(error, "whatsapp"));
      setEmbeddedSignupState("error");
    } finally {
      window.clearTimeout(slowHintTimer);
      if (isCurrentRun()) setEmbeddedSignupSlow(false);
    }
  }, [connectEmbedded, isEmbeddedSignupEnabled, metaAppId, metaEmbeddedConfigId]);

  return (
    <>
      <DashboardHeader />
      <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-4 md:p-8">
        <TaskPageHeader
          href="/parametres/whatsapp"
          actions={
            <Badge
              variant={isConnected ? "success" : "destructive"}
              className="py-1.5 text-sm"
            >
              {isConnected ? "Connecté" : "Non connecté"}
            </Badge>
          }
        />

        <Card className="border-border shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="text-xl">Votre numéro WhatsApp</CardTitle>
            <CardDescription className="text-sm">
              Le numéro qui reçoit les codes et envoie les confirmations.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {/* Carte d'état : un seul bouton, un seul chemin.
                L'ancien parcours en deux étapes numérotées demandait de coller trois
                identifiants Meta ; il vit désormais sous « Configuration avancée ». */}
            <div className="rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {isConnected ? ui.whatsapp.connectedTitle : ui.whatsapp.disconnectedTitle}
                  </p>
                  <p className="max-w-[60ch] text-xs leading-5 text-muted-foreground">
                    {isConnected && (serverBusinessPhoneNumber ?? serverPhoneNumberId)
                      ? ui.whatsapp.connectedDetail(
                          serverBusinessPhoneNumber ?? serverPhoneNumberId ?? "",
                        )
                      : ui.whatsapp.disconnectedDetail}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  {isConnected && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => testConnection.mutate()}
                      disabled={testConnection.isPending}
                      className="min-h-11"
                    >
                      {testConnection.isPending ? "Test en cours…" : ui.whatsapp.test}
                    </Button>
                  )}
                  {!isCoexistenceEnabled && (
                    <Button
                      type="button"
                      onClick={() => void handleEmbeddedSignup("cloud_api")}
                      disabled={signupBusy}
                      className="min-h-11 font-semibold"
                    >
                      {signupButtonLabel(isConnected ? ui.whatsapp.reconnect : ui.whatsapp.connect)}
                    </Button>
                  )}
                </div>
              </div>

              {/**
                * ── DEUX PORTES, ET LA BONNE EN PREMIER ──────────────────────
                *
                * Un seul bouton menait au parcours « nouveau numéro ». C'est la
                * mauvaise porte pour la majorité des boutiques, dont le numéro
                * sert déjà dans l'application WhatsApp Business : Meta leur
                * demandait alors de supprimer ce compte, donc de perdre
                * historique et contacts. Beaucoup abandonnaient là.
                *
                * Le choix est désormais posé avant d'ouvrir quoi que ce soit, et
                * le cas courant est mis en avant.
                */}
              {isCoexistenceEnabled && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-primary/40 bg-background p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Je garde mon numéro WhatsApp Business
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Recommandé. Vous conservez l’application, vos contacts et vos
                        conversations. Un code vous sera envoyé dans WhatsApp Business,
                        vous n’avez rien à créer.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => void handleEmbeddedSignup("coexistence")}
                      disabled={signupBusy}
                      className="min-h-11 w-full font-semibold"
                    >
                      {signupButtonLabel(isConnected ? "Reconnecter ce numéro" : "Connecter ce numéro")}
                    </Button>
                  </div>

                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-background p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        J’utilise un nouveau numéro
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Pour un numéro qui n’est encore relié à aucun compte WhatsApp.
                        Meta vous guidera pour le déclarer et le vérifier.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleEmbeddedSignup("cloud_api")}
                      disabled={signupBusy}
                      className="min-h-11 w-full font-semibold"
                    >
                      {signupButtonLabel(isConnected ? "Basculer sur un autre numéro" : "Déclarer un numéro")}
                    </Button>
                  </div>
                </div>
              )}

              {embeddedSignupSlow && embeddedSignupState === "loading" && (
                <Alert className="mt-3">
                  <AlertDescription>
                    La fenêtre WhatsApp ne s’est pas ouverte. Vérifiez que votre
                    navigateur n’a pas bloqué les fenêtres surgissantes pour ce site,
                    puis réessayez. Si le problème persiste, vos identifiants restent
                    modifiables dans « Configuration avancée ».
                  </AlertDescription>
                </Alert>
              )}
              {embeddedSignupState === "success" && (
                <Alert className="mt-3 border-success/50 bg-success/10 text-success [&>svg]:text-success">
                  <AlertDescription>
                    WhatsApp est connecté. Votre clientèle peut vous écrire.
                  </AlertDescription>
                </Alert>
              )}

              {/**
                * ── DIRE OÙ EN EST LA REPRISE DES CONVERSATIONS ──────────────
                *
                * L'écran annonçait « Connecté » et s'arrêtait là. En Coexistence,
                * la reprise de l'historique arrive par tranches et prend du
                * temps : sans cet état, une boutique qui ne retrouve pas encore
                * ses conversations ne peut pas savoir s'il faut patienter ou
                * s'inquiéter.
                */}
              {historySyncNotice && (
                <Alert className="mt-3">
                  <AlertDescription>
                    {historySyncNotice}
                    {data?.historySyncStatus === "failed" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-3"
                        onClick={() => {
                          setHistorySyncError(null);
                          retryHistorySync.mutate();
                        }}
                        disabled={retryHistorySync.isPending}
                      >
                        {retryHistorySync.isPending ? "Reprise…" : "Réessayer"}
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {historySyncError && (
                <ErrorAlert error={historySyncError} className="mt-3" />
              )}
              {embeddedSignupError && (
                <ErrorAlert error={embeddedSignupError} className="mt-3" />
              )}
            </div>

            {/* Saisie manuelle : dépannage uniquement. */}
            <details className="mt-6 rounded-xl border border-border">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {ui.whatsapp.advanced}
                <span className="ml-2 font-normal text-muted-foreground">
                  {ui.whatsapp.advancedHint}
                </span>
              </summary>
              {/*
                Un vrai formulaire, et pas seulement pour faire taire un
                avertissement : Chrome signale tout champ de type `password`
                laissé hors formulaire, parce que sans lui la soumission au
                clavier ne fonctionne pas et que les gestionnaires de mots de
                passe ne savent pas quoi faire du champ.

                Ici les deux comptent. La touche Entrée enregistre désormais les
                identifiants, ce qu'on attend de trois champs saisis à la suite ;
                et `autoComplete="off"` sur le jeton dit clairement qu'il ne
                s'agit pas d'un mot de passe à retenir, mais d'un secret d'API.
              */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isLocked || setConfig.isPending || isLoading) return;
                  handleSave();
                }}
                className="flex flex-col gap-6 border-t border-border p-4 sm:p-5"
              >
                {/* Phone Number ID */}
                <div className="space-y-2">
                  <Label
                    htmlFor="meta-phone-number-id"
                    className="text-sm font-semibold text-foreground"
                  >
                    Phone Number ID
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="meta-phone-number-id"
                      type="text"
                      placeholder="123456789012345"
                      value={metaPhoneNumberId}
                      onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                      className="pl-10"
                      disabled={isLoading || isLocked}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Identifiant technique fourni par Meta — ce n’est pas votre numéro de téléphone.
                  </p>
                </div>

                {/* WABA ID */}
                <div className="space-y-2">
                  <Label
                    htmlFor="meta-waba-id"
                    className="text-sm font-semibold text-foreground"
                  >
                    WABA ID (WhatsApp Business Account)
                  </Label>
                  <Input
                    id="meta-waba-id"
                    type="text"
                    placeholder="109876543210"
                    value={metaWabaId}
                    onChange={(e) => setMetaWabaId(e.target.value)}
                    disabled={isLoading || isLocked}
                  />
                  <p className="text-xs text-muted-foreground">
                    Identifiant de votre compte WhatsApp Business
                  </p>
                </div>

                {/* Access Token */}
                <div className="space-y-2">
                  <Label
                    htmlFor="meta-access-token"
                    className="text-sm font-semibold text-foreground"
                  >
                    Access Token
                  </Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="meta-access-token"
                      type={showToken ? "text" : "password"}
                      /*
                        Ce champ porte un secret d'API, pas un mot de passe de
                        compte. `off` évite qu'un gestionnaire de mots de passe
                        propose de l'enregistrer sous l'identité de la vendeuse —
                        il n'a rien à voir avec sa connexion à SnapSell, et il
                        change à chaque renouvellement côté Meta.
                      */
                      autoComplete="off"
                      placeholder={serverHasToken ? "Token configuré — laisser vide pour conserver" : "EAAxxxxxxx..."}
                      value={metaAccessToken}
                      onChange={(e) => setMetaAccessToken(e.target.value)}
                      className="pl-10 pr-10"
                      disabled={isLoading || isLocked}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0"
                      onClick={() => setShowToken((v) => !v)}
                      aria-label={showToken ? "Masquer le token" : "Afficher le token"}
                    >
                      {showToken ? (
                        <EyeOff className="size-4 text-muted-foreground" />
                      ) : (
                        <Eye className="size-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Token d&apos;accès permanent de votre application Meta.
                    {serverHasToken && " Un token est déjà configuré. Laissez vide pour le conserver."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {isLocked ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                      className="font-semibold"
                    >
                      Modifier les identifiants
                    </Button>
                  ) : (
                    <>
                      {isConnected && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCancel}
                          className="font-semibold"
                        >
                          Annuler
                        </Button>
                      )}
                      {/*
                        `submit` et non `button` : c'est lui qui donne son sens
                        au formulaire, et qui rend la touche Entrée équivalente
                        au clic. Les boutons voisins restent en `button`, sous
                        peine d'enregistrer quand on veut annuler.
                      */}
                      <Button
                        type="submit"
                        disabled={setConfig.isPending || isLoading}
                        className="font-semibold shadow-lg shadow-primary/20"
                      >
                        {setConfig.isPending
                          ? "Enregistrement…"
                          : isConnected
                            ? "Mettre à jour"
                            : "Connecter"}
                      </Button>
                    </>
                  )}
                </div>

                <Alert className="border-dashed bg-muted/50">
                  <Info className="size-4 text-primary" />
                  <AlertDescription className="text-xs leading-relaxed">
                    Ces champs ne servent qu’au dépannage. Dans le cas normal, le bouton
                    «&nbsp;{ui.whatsapp.connect}&nbsp;» ci-dessus fait tout à votre place.
                  </AlertDescription>
                </Alert>
              </form>
            </details>
          </CardContent>
        </Card>

        {/* Catalogue Meta et modèles de message — utiles à une minorité de
            vendeuses, donc repliés. */}
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            Fonctions avancées
            <span className="ml-2 font-normal text-muted-foreground">
              Catalogue et modèles de message
            </span>
          </summary>
          <div className="border-t border-border p-4 sm:p-5">
            <WhatsAppAdvancedSections />
          </div>
        </details>

        {/* Numéros vendeur */}
        <Card className="border-border shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="text-xl">Numéros vendeur</CardTitle>
            <CardDescription className="text-sm">
              {ui.whatsapp.sellerPhonesDetail}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="seller-phone"
                    className="text-sm font-semibold text-foreground"
                  >
                    Ajouter un numéro
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="seller-phone"
                      type="text"
                      placeholder={PLACEHOLDER}
                      value={newSellerPhone}
                      onChange={(e) => setNewSellerPhone(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && (e.preventDefault(), handleAddSellerPhone())
                      }
                      className="pl-10"
                      disabled={sellerPhonesLoading || addSellerPhone.isPending}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="default"
                  className="gap-2 sm:self-end"
                  onClick={handleAddSellerPhone}
                  disabled={
                    !newSellerPhone.trim() ||
                    sellerPhonesLoading ||
                    addSellerPhone.isPending
                  }
                >
                  <Plus className="size-4" />
                  Ajouter
                </Button>
              </div>
              {sellerPhoneError && <ErrorAlert error={sellerPhoneError} />}
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  Numéros enregistrés ({sellerPhones.length})
                </p>
                {sellerPhonesLoading ? (
                  <p className="text-sm text-muted-foreground">Chargement…</p>
                ) : sellerPhones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Vous n’avez pas encore déclaré de numéro. Ajoutez-le avec
                    l’indicatif du pays, par exemple +225 07 01 02 03 04.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {sellerPhones.map((sp) => (
                      <li
                        key={sp.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-foreground">
                          {sp.phoneNumber}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeSellerPhone.mutate({ id: sp.id })}
                          disabled={removeSellerPhone.isPending}
                        >
                          <Trash2 className="size-4" />
                          Supprimer
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Messages + actions */}
        {testError && <ErrorAlert error={testError} />}
        {testSuccess && (
          <Alert className="border-success/50 bg-success/10 text-success [&>svg]:text-success">
            <AlertDescription>Connexion WhatsApp opérationnelle.</AlertDescription>
          </Alert>
        )}
        {saveError && <ErrorAlert error={saveError} />}
        {saveSuccess && (
          <Alert className="border-success/50 bg-success/10 text-success [&>svg]:text-success">
            <AlertDescription>
              Configuration enregistrée.
            </AlertDescription>
          </Alert>
        )}

        <div className="pb-12" />
      </div>
    </>
  );
}
