export type SupportIssueId =
  | "connection"
  | "messages"
  | "history"
  | "interrupted";

export type MetaTestState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export type GuidanceTone = "success" | "warning" | "danger" | "info";

export type GuidanceCheck = {
  label: string;
  detail: string;
  tone: GuidanceTone;
};

export type GuidanceAction =
  | "test_meta"
  | "copy_message"
  | "retry_sync"
  | "open_technical"
  | "refresh";

export type GuidedDiagnosis = {
  tone: GuidanceTone;
  title: string;
  summary: string;
  checks: GuidanceCheck[];
  action: GuidanceAction;
  actionLabel: string;
  sellerMessage: string | null;
};

export const SUPPORT_ISSUES: ReadonlyArray<{
  id: SupportIssueId;
  title: string;
  description: string;
}> = [
  {
    id: "connection",
    title: "Connexion WhatsApp impossible",
    description: "La boutique bloque pendant la première connexion.",
  },
  {
    id: "messages",
    title: "Messages non reçus",
    description: "WhatsApp semble connecté, mais les échanges n’arrivent pas.",
  },
  {
    id: "history",
    title: "Historique ou contacts absents",
    description: "Les anciennes conversations ou les noms ne sont pas repris.",
  },
  {
    id: "interrupted",
    title: "Connexion interrompue",
    description: "La connexion fonctionnait auparavant et semble coupée.",
  },
];

type DiagnosticSnapshot = {
  connected: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  hasAccessToken: boolean;
  coexistence: boolean | null;
  historySyncStatus: string | null;
  contactsSyncStatus: string | null;
  historySyncAt: Date | null;
};

const HOUR_MS = 60 * 60 * 1_000;

function connectionChecks(
  diagnostic: DiagnosticSnapshot,
  metaTest: MetaTestState,
): GuidanceCheck[] {
  const checks: GuidanceCheck[] = [
    {
      label: "Numéro WhatsApp reconnu",
      detail: diagnostic.phoneNumberId ? "Présent" : "Information manquante",
      tone: diagnostic.phoneNumberId ? "success" : "danger",
    },
    {
      label: "Compte WhatsApp reconnu",
      detail: diagnostic.wabaId ? "Présent" : "Information manquante",
      tone: diagnostic.wabaId ? "success" : "danger",
    },
    {
      label: "Autorisation Meta enregistrée",
      detail: diagnostic.hasAccessToken ? "Présente" : "Information manquante",
      tone: diagnostic.hasAccessToken ? "success" : "danger",
    },
  ];

  if (metaTest.status === "success") {
    checks.push({
      label: "Réponse de Meta",
      detail: "Connexion acceptée",
      tone: "success",
    });
  } else if (metaTest.status === "error") {
    checks.push({
      label: "Réponse de Meta",
      detail: "Connexion refusée",
      tone: "danger",
    });
  }

  return checks;
}

function incompleteConnection(diagnostic: DiagnosticSnapshot): GuidedDiagnosis {
  return {
    tone: "warning",
    title: "La connexion n’est pas terminée",
    summary:
      "SnapSell n’a pas reçu toutes les informations nécessaires. La boutique doit reprendre la connexion depuis ses paramètres.",
    checks: connectionChecks(diagnostic, { status: "idle" }),
    action: "copy_message",
    actionLabel: "Copier les étapes à envoyer",
    sellerMessage:
      "Bonjour, ouvrez SnapSell puis allez dans Paramètres > WhatsApp. Appuyez sur « Connecter mon WhatsApp Business » et suivez toutes les étapes jusqu’au retour dans SnapSell. Gardez votre téléphone et WhatsApp Business ouverts pendant la connexion.",
  };
}

function metaFailure(
  diagnostic: DiagnosticSnapshot,
  metaTest: Extract<MetaTestState, { status: "error" }>,
): GuidedDiagnosis {
  return {
    tone: "danger",
    title: "Meta refuse la connexion actuelle",
    summary:
      "Les informations sont enregistrées, mais Meta ne les accepte plus. Une vérification technique des identifiants est nécessaire.",
    checks: connectionChecks(diagnostic, metaTest),
    action: "open_technical",
    actionLabel: "Ouvrir les détails techniques",
    sellerMessage: null,
  };
}

function pendingMetaTest(diagnostic: DiagnosticSnapshot): GuidedDiagnosis {
  return {
    tone: "info",
    title: "Les informations de connexion sont présentes",
    summary:
      "Interrogez Meta pour vérifier qu’elles sont encore valides. Ce test ne modifie rien dans la boutique.",
    checks: connectionChecks(diagnostic, { status: "idle" }),
    action: "test_meta",
    actionLabel: "Tester la connexion Meta",
    sellerMessage: null,
  };
}

function historyDiagnosis(
  diagnostic: DiagnosticSnapshot,
  now: Date,
): GuidedDiagnosis {
  if (diagnostic.coexistence !== true) {
    return {
      tone: "info",
      title: "Aucune reprise d’historique n’est attendue",
      summary:
        "Cette boutique n’utilise pas le mode qui conserve l’application WhatsApp Business et reprend les anciennes conversations.",
      checks: [
        {
          label: "Mode avec reprise de l’historique",
          detail: diagnostic.coexistence === false ? "Non utilisé" : "Non déterminé",
          tone: "info",
        },
      ],
      action: "open_technical",
      actionLabel: "Consulter les détails techniques",
      sellerMessage: null,
    };
  }

  const history = diagnostic.historySyncStatus;
  const contacts = diagnostic.contactsSyncStatus;
  const checks: GuidanceCheck[] = [
    {
      label: "Anciennes conversations",
      detail:
        history === "completed"
          ? "Reprises"
          : history === "declined"
            ? "Partage refusé"
            : history === "failed"
              ? "Échec de la reprise"
              : "Reprise en cours",
      tone:
        history === "completed"
          ? "success"
          : history === "failed"
            ? "danger"
            : history === "declined"
              ? "warning"
              : "info",
    },
    {
      label: "Noms des contacts",
      detail:
        contacts === "completed"
          ? "Repris"
          : contacts === "failed"
            ? "Échec de la reprise"
            : "Reprise en cours",
      tone:
        contacts === "completed"
          ? "success"
          : contacts === "failed"
            ? "danger"
            : "info",
    },
  ];

  if (history === "completed" && contacts === "completed") {
    return {
      tone: "success",
      title: "La reprise est terminée",
      summary:
        "Les anciennes conversations et les contacts ont bien été repris. Aucune intervention n’est nécessaire.",
      checks,
      action: "copy_message",
      actionLabel: "Copier la confirmation",
      sellerMessage:
        "Bonjour, la reprise de vos anciennes conversations et de vos contacts est terminée. Vous pouvez continuer à utiliser WhatsApp Business normalement.",
    };
  }

  if (history === "declined") {
    return {
      tone: "warning",
      title: "Le partage de l’historique a été refusé",
      summary:
        "La connexion WhatsApp reste utilisable. Les anciennes conversations ne seront simplement pas visibles dans SnapSell.",
      checks,
      action: "copy_message",
      actionLabel: "Copier l’explication",
      sellerMessage:
        "Bonjour, votre connexion WhatsApp fonctionne. Le partage des anciennes conversations n’a pas été autorisé pendant la connexion, elles ne seront donc pas reprises dans SnapSell. Les nouveaux messages continueront de fonctionner.",
    };
  }

  const elapsed = diagnostic.historySyncAt
    ? now.getTime() - diagnostic.historySyncAt.getTime()
    : Number.POSITIVE_INFINITY;
  const canRetry = elapsed <= 24 * HOUR_MS;
  if ((history === "failed" || contacts === "failed") && canRetry) {
    return {
      tone: "warning",
      title: "La reprise a rencontré un problème",
      summary:
        "La connexion WhatsApp reste active. Vous pouvez relancer la reprise tant que le délai de 24 heures n’est pas écoulé.",
      checks,
      action: "retry_sync",
      actionLabel: "Relancer la reprise",
      sellerMessage: null,
    };
  }

  if ((history === "failed" || contacts === "failed") && !canRetry) {
    return {
      tone: "danger",
      title: "Le délai de reprise est dépassé",
      summary:
        "WhatsApp limite la reprise à 24 heures après la connexion. La messagerie reste utilisable, mais les anciennes données ne peuvent plus être récupérées.",
      checks,
      action: "copy_message",
      actionLabel: "Copier l’explication",
      sellerMessage:
        "Bonjour, votre connexion WhatsApp fonctionne, mais le délai accordé pour reprendre les anciennes conversations est dépassé. Les nouveaux messages continueront de fonctionner normalement.",
    };
  }

  return {
    tone: "info",
    title: "La reprise est en cours",
    summary:
      "WhatsApp traite encore les anciennes conversations ou les contacts. Cela peut prendre plusieurs minutes.",
    checks,
    action: "refresh",
    actionLabel: "Actualiser le diagnostic",
    sellerMessage: null,
  };
}

export function getGuidedDiagnosis(params: {
  issue: SupportIssueId;
  diagnostic: DiagnosticSnapshot;
  metaTest: MetaTestState;
  now?: Date;
}): GuidedDiagnosis {
  const { issue, diagnostic, metaTest, now = new Date() } = params;

  if (issue === "history") {
    return historyDiagnosis(diagnostic, now);
  }

  if (!diagnostic.connected) {
    return incompleteConnection(diagnostic);
  }
  if (metaTest.status === "idle") {
    return pendingMetaTest(diagnostic);
  }
  if (metaTest.status === "error") {
    return metaFailure(diagnostic, metaTest);
  }

  if (issue === "connection") {
    return {
      tone: "success",
      title: "WhatsApp est déjà connecté à SnapSell",
      summary:
        "Meta accepte la connexion actuelle. La boutique peut revenir dans SnapSell et continuer sa mise en route.",
      checks: connectionChecks(diagnostic, metaTest),
      action: "copy_message",
      actionLabel: "Copier la confirmation",
      sellerMessage:
        "Bonjour, votre connexion WhatsApp est bien active dans SnapSell. Revenez dans votre tableau de bord puis actualisez la page pour continuer la mise en route.",
    };
  }

  if (issue === "messages") {
    return {
      tone: "info",
      title: "La connexion Meta fonctionne",
      summary:
        "Le test confirme les identifiants, mais il ne prouve pas encore qu’un message arrive jusqu’à SnapSell. Faites envoyer un message test avant d’escalader.",
      checks: connectionChecks(diagnostic, metaTest),
      action: "copy_message",
      actionLabel: "Copier le test à envoyer",
      sellerMessage:
        "Bonjour, la connexion WhatsApp est active. Demandez à une personne d’envoyer « TEST SNAPSELL » à votre numéro WhatsApp Business, puis vérifiez si le message apparaît dans SnapSell.",
    };
  }

  return {
    tone: "success",
    title: "La connexion est toujours active",
    summary:
      "Meta répond correctement. Si la boutique rencontre encore une coupure, faites un message test puis consultez les journaux avec son heure d’envoi.",
    checks: connectionChecks(diagnostic, metaTest),
    action: "copy_message",
    actionLabel: "Copier le test à envoyer",
    sellerMessage:
      "Bonjour, la connexion WhatsApp est active. Faites envoyer « TEST SNAPSELL » à votre numéro, puis notez l’heure exacte si le message n’apparaît pas afin que le support poursuive le diagnostic.",
  };
}
