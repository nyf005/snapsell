import { formatXofUnits } from "./copy/format";
/**
 * Story 7A.2: Configuration complète des 3 plans (Free, Starter, Pro)
 * avec entitlements, prix, overages, feature flags, plan codes Paystack.
 *
 * Métrique de facturation = commandes confirmées + sessions client (credits)
 */

export type PlanId = "free" | "starter" | "pro";

export interface PlanEntitlements {
  // Legacy: commandes limitées (deprecated - maintenant illimité, remplacé par credits)
  maxConfirmedOrdersPerMonth: number;
  maxProofsPerMonth: number; // -1 = illimité
  maxAgents: number;
  /**
   * @deprecated Vestige du modèle « dépassement facturé », abandonné au profit du
   * prépayé (packs de crédits). Plus aucun prélèvement ne s'appuie dessus ; seul
   * `getUsageThisCycle` s'en sert pour un montant indicatif non affiché.
   */
  overagePerOrderCents: number;
  creditsTotalMonthly: number; // Credits d'automatisation (sessions 24h)
  hasAI: boolean; // Analyse IA des messages entrants
  hasExportCsv: boolean; // Accès à l'export CSV (commandes + journal)
  hasAdvancedExports: boolean; // Colonnes enrichies dans l'export commandes
  /**
   * Envoi de notifications hors fenêtre WhatsApp de 24h, via templates Meta approuvés.
   *
   * ⚠️ NON IMPLÉMENTÉ — `MetaCloudAdapter.sendTemplate()` existe mais n'est appelé
   * nulle part. Aucun plan ne bénéficie donc de l'envoi hors 24h aujourd'hui, et
   * tous — Free inclus — reçoivent les notifications de statut dans la fenêtre.
   *
   * Ce flag n'est volontairement associé à AUCUN garde-fou : verrouiller une capacité
   * inexistante n'apporterait rien, et priver Free des notifications qu'il reçoit déjà
   * serait une régression. Le drapeau reste prêt pour la livraison des templates —
   * voir docs/plan-whatsapp-template-workflows.md.
   */
  hasNotificationsOutside24h: boolean;
  hasDepositRecommended: boolean; // Active requireDeposit à la souscription
  /**
   * Profondeur du journal d'audit, en jours. `-1` = illimité.
   *
   * Remplace l'ancien booléen `hasAdvancedFilters`, qui ne pouvait exprimer que
   * deux niveaux alors que la grille en compte trois (30 / 90 / illimité).
   *
   * Lu depuis la config du plan via `getAuditRetentionDays()`, et non depuis une
   * colonne dénormalisée sur Tenant : une seule source de vérité, donc aucune
   * dérive possible, et le bon comportement pour tous les tenants existants sans
   * migration de données.
   */
  auditRetentionDays: number;
  /**
   * @deprecated Superseded par `auditRetentionDays`. La colonne `has_advanced_filters`
   * existe encore sur Tenant mais n'est plus lue : la suppression du champ est une
   * migration destructive, à décider séparément.
   */
  hasAdvancedFilters: boolean;
  hasPrioritySupport: boolean; // Processus humain — aucun garde-fou applicatif
  showBranding: boolean;
  showUpgradeBanner: boolean;
}

export interface PlanConfig {
  id: PlanId;
  name: string;
  price: number; // FCFA / mois
  currency: string;
  interval: "monthly";
  description: string;
  popular?: boolean;
  /** Env var name for Paystack plan code (resolved lazily). null for Free. */
  paystackPlanCodeEnv: string | null;
  entitlements: PlanEntitlements;
  features: string[]; // Pour affichage page Tarifs
  /**
   * Mention affichée sous le prix pour les recharges de conversations.
   *
   * ⚠️ Le modèle est **prépayé** : une fois les conversations du mois épuisées, les
   * nouvelles sessions sont bloquées jusqu'à l'achat d'un pack. Il n'y a pas de
   * dépassement facturé a posteriori. La formulation doit donc annoncer une recharge,
   * pas un compteur — l'ancien libellé « + 2 500 FCFA / 100 conversations » laissait
   * croire à un postpayé au compteur.
   */
  creditPackLabel?: string;
  /** Prix d'un pack de 100 crédits supplémentaires (FCFA). null = non disponible. */
  creditPackPriceFCFA: number | null;
}

export const SUBSCRIPTION_PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "XOF",
    interval: "monthly",
    description: "Pour se lancer et tenir ses commandes au propre",
    paystackPlanCodeEnv: null,
    entitlements: {
      maxConfirmedOrdersPerMonth: 999_999, // Illimité (remplacé par credits)
      maxProofsPerMonth: -1,
      maxAgents: 0,
      overagePerOrderCents: 0, // Blocage, pas de nouvelle session
      creditsTotalMonthly: 70,
      hasAI: false, // Free: pas d'IA
      hasExportCsv: false,
      hasAdvancedExports: false,
      hasNotificationsOutside24h: false,
      hasDepositRecommended: false,
      auditRetentionDays: 30,
      hasAdvancedFilters: false,
      hasPrioritySupport: false,
      showBranding: true,
      showUpgradeBanner: true,
    },
    features: [
      "70 conversations client / mois",
      "1 vendeur (pas d'agents)",
      "Grille catégories → prix",
      "Réservation, file d’attente et délai",
      "Tableau de bord des commandes",
      "Preuves de paiement illimitées",
      "Journal d'activité sur 30 jours",
    ],
    // Pas de recharge en Free : le palier d'essai doit forcer une décision.
    //
    // Ouvrir les packs au Free créait une inversion tarifaire — 5 packs à 3 000 F
    // donnaient 570 conversations pour 15 000 F, là où le Starter en offre 500 pour
    // 25 000 F. Un prospect qui fait ce calcul n'y voit pas une astuce, il y voit
    // une grille mal pensée. Rouvrir les packs ici plus tard est trivial et ne
    // rompt aucune promesse ; l'inverse le serait beaucoup moins.
    creditPackPriceFCFA: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    price: 25_000,
    currency: "XOF",
    interval: "monthly",
    description: "Pour vendre plus sans rien noter à la main",
    paystackPlanCodeEnv: "PAYSTACK_PLAN_STARTER",
    entitlements: {
      maxConfirmedOrdersPerMonth: 999_999, // Illimité (remplacé par credits)
      maxProofsPerMonth: -1,
      maxAgents: 1,
      overagePerOrderCents: 2_500, // 25 FCFA/session → 2 500 FCFA/100 sessions
      creditsTotalMonthly: 500,
      hasAI: true, // Starter: IA activée
      hasExportCsv: true,
      hasAdvancedExports: false,
      hasNotificationsOutside24h: true,
      hasDepositRecommended: true,
      auditRetentionDays: 90,
      hasAdvancedFilters: false,
      hasPrioritySupport: false,
      showBranding: false,
      showUpgradeBanner: false,
    },
    features: [
      "500 conversations client / mois",
      "1 vendeur + 1 agent",
      "Suivi complet des preuves de paiement",
      "Export CSV des commandes et du journal",
      "Notifications statut",
      "Acompte recommandé (défaut ON)",
      "Journal d'activité sur 90 jours",
    ],
    creditPackLabel: "Recharge : 2 500 FCFA les 100 conversations",
    creditPackPriceFCFA: 2_500,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 50_000,
    currency: "XOF",
    interval: "monthly",
    description: "Pour les équipes qui gèrent de gros volumes",
    popular: true,
    paystackPlanCodeEnv: "PAYSTACK_PLAN_PRO",
    entitlements: {
      maxConfirmedOrdersPerMonth: 999_999, // Illimité (remplacé par credits)
      maxProofsPerMonth: -1,
      maxAgents: 5,
      overagePerOrderCents: 2_000, // 20 FCFA/session → 2 000 FCFA/100 sessions
      creditsTotalMonthly: 1500,
      hasAI: true, // Pro: IA activée
      hasExportCsv: true,
      hasAdvancedExports: true,
      hasNotificationsOutside24h: true,
      hasDepositRecommended: true,
      auditRetentionDays: -1,
      hasAdvancedFilters: true,
      hasPrioritySupport: true,
      showBranding: false,
      showUpgradeBanner: false,
    },
    features: [
      "1 500 conversations client / mois",
      "Jusqu'à 5 agents",
      "Journal d'activité sans limite de durée",
      "Export CSV enrichi (quantité, variante, commune, délais)",
      "Notifications statut",
      "Acompte recommandé",
      "Support prioritaire",
    ],
    creditPackLabel: "Recharge : 2 000 FCFA les 100 conversations",
    creditPackPriceFCFA: 2_000,
  },
};

/** All plan IDs in display order */
export const PLAN_IDS: PlanId[] = ["free", "starter", "pro"];

/** Resolve the Paystack plan code from env at runtime */
export function getPaystackPlanCode(plan: PlanConfig): string | null {
  if (!plan.paystackPlanCodeEnv) return null;
  return process.env[plan.paystackPlanCodeEnv] ?? null;
}

/** Get plan config by ID (throws if invalid) */
export function getPlanConfig(planId: string): PlanConfig {
  const plan = SUBSCRIPTION_PLANS[planId as PlanId];
  if (!plan) {
    throw new Error(`Unknown plan: ${planId}`);
  }
  return plan;
}

/**
 * Profondeur du journal d'audit autorisée pour un plan, en jours (`-1` = illimité).
 *
 * Ne lève jamais : un plan inconnu (donnée corrompue) retombe sur le niveau Free,
 * le plus restrictif. Consulter le journal ne doit pas échouer parce qu'une valeur
 * de plan est invalide — mais on ne doit pas non plus ouvrir l'historique complet.
 */
export function getAuditRetentionDays(planId: string): number {
  const plan = SUBSCRIPTION_PLANS[planId as PlanId];
  return (plan ?? SUBSCRIPTION_PLANS.free).entitlements.auditRetentionDays;
}

/**
 * Prix d'un plan, en unités (pas en centimes).
 * Délègue au formateur partagé pour que la monnaie s'écrive partout pareil.
 */
export function formatPriceFCFA(amount: number): string {
  if (amount === 0) return "Gratuit";
  return formatXofUnits(amount);
}