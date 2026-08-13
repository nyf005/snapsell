import { describe, expect, it } from "vitest";

import { getGuidedDiagnosis } from "./support-guidance";

const baseDiagnostic = {
  connected: true,
  phoneNumberId: "phone-123",
  wabaId: "waba-123",
  hasAccessToken: true,
  coexistence: true,
  historySyncStatus: "completed",
  contactsSyncStatus: "completed",
  historySyncAt: new Date("2026-08-13T08:00:00Z"),
};

describe("getGuidedDiagnosis", () => {
  it("ne prétend pas que Meta fonctionne avant le test réel", () => {
    const result = getGuidedDiagnosis({
      issue: "connection",
      diagnostic: baseDiagnostic,
      metaTest: { status: "idle" },
    });

    expect(result.title).toBe("Les informations de connexion sont présentes");
    expect(result.action).toBe("test_meta");
  });

  it("oriente une configuration incomplète vers une reconnexion", () => {
    const result = getGuidedDiagnosis({
      issue: "connection",
      diagnostic: {
        ...baseDiagnostic,
        connected: false,
        wabaId: null,
        hasAccessToken: false,
      },
      metaTest: { status: "idle" },
    });

    expect(result.title).toBe("La connexion n’est pas terminée");
    expect(result.action).toBe("copy_message");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Compte WhatsApp reconnu",
          tone: "danger",
        }),
      ]),
    );
  });

  it("permet une reprise échouée seulement dans la fenêtre de 24 heures", () => {
    const now = new Date("2026-08-13T12:00:00Z");
    const result = getGuidedDiagnosis({
      issue: "history",
      diagnostic: {
        ...baseDiagnostic,
        historySyncStatus: "failed",
        historySyncAt: new Date("2026-08-13T08:00:00Z"),
      },
      metaTest: { status: "idle" },
      now,
    });

    expect(result.action).toBe("retry_sync");
    expect(result.actionLabel).toBe("Relancer la reprise");
  });

  it("explique franchement quand la fenêtre de reprise est dépassée", () => {
    const result = getGuidedDiagnosis({
      issue: "history",
      diagnostic: {
        ...baseDiagnostic,
        historySyncStatus: "failed",
        historySyncAt: new Date("2026-08-11T08:00:00Z"),
      },
      metaTest: { status: "idle" },
      now: new Date("2026-08-13T12:00:00Z"),
    });

    expect(result.title).toBe("Le délai de reprise est dépassé");
    expect(result.action).toBe("copy_message");
  });

  it("ne confond pas un refus de partage avec une panne", () => {
    const result = getGuidedDiagnosis({
      issue: "history",
      diagnostic: {
        ...baseDiagnostic,
        historySyncStatus: "declined",
      },
      metaTest: { status: "idle" },
    });

    expect(result.title).toBe("Le partage de l’historique a été refusé");
    expect(result.summary).toContain("connexion WhatsApp reste utilisable");
  });
});
