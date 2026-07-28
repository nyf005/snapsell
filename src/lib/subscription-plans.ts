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
  overagePerOrderCents: number; // 0 = blocage (Free)
  creditsTotalMonthly: number; // Credits d'automatisation (sessions 24h)
  hasAI: boolean; // AI Analysis pour les messages entrants
  hasExportCsv: boolean;
  hasAdvancedExports: boolean;
  hasNotificationsOutside24h: boolean;
  hasDepositRecommended: boolean;
  hasAdvancedFilters: boolean;
  hasPrioritySupport: boolean;
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
  overageLabel?: string; // Ex: "2 500 FCFA / 100 conversations"
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
    ],
    creditPackPriceFCFA: 3_000,
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
      hasAdvancedFilters: false,
      hasPrioritySupport: false,
      showBranding: false,
      showUpgradeBanner: false,
    },
    features: [
      "500 conversations client / mois",
      "1 vendeur + 1 agent",
      "Suivi complet des preuves de paiement",
      "Export CSV basique",
      "Notifications statut",
      "Acompte recommandé (défaut ON)",
    ],
    overageLabel: "2 500 FCFA / 100 conversations",
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
      hasAdvancedFilters: true,
      hasPrioritySupport: true,
      showBranding: false,
      showUpgradeBanner: false,
    },
    features: [
      "1 500 conversations client / mois",
      "Jusqu'à 5 agents",
      "Filtres avancés + audit renforcé",
      "Export CSV avancé (multi-filtres)",
      "Notifications statut",
      "Acompte recommandé",
      "Support prioritaire",
    ],
    overageLabel: "2 000 FCFA / 100 conversations",
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

/** Get plan config by Paystack plan code (resolved from env at runtime) */
export function getPlanByPaystackCode(planCode: string): PlanConfig | undefined {
  return Object.values(SUBSCRIPTION_PLANS).find((p) => {
    const code = getPaystackPlanCode(p);
    return code != null && code === planCode;
  });
}

/**
 * Prix d'un plan, en unités (pas en centimes).
 * Délègue au formateur partagé pour que la monnaie s'écrive partout pareil.
 */
export function formatPriceFCFA(amount: number): string {
  if (amount === 0) return "Gratuit";
  return formatXofUnits(amount);
}