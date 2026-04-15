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
  price: number; // FCA / mois
  currency: string;
  interval: "monthly";
  description: string;
  popular?: boolean;
  /** Env var name for Paystack plan code (resolved lazily). null for Free. */
  paystackPlanCodeEnv: string | null;
  entitlements: PlanEntitlements;
  features: string[]; // Pour affichage page Tarifs
  overageLabel?: string; // Ex: "2 500 FCA / 100 sessions"
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
    description: "Testez votre premier live propre",
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
      "70 sessions client / mois",
      "1 vendeur (pas d'agents)",
      "Grille catégories → prix",
      "Réservation + file + TTL",
      "Dashboard commandes basique",
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
    description: "Monétisez votre live sans stress",
    paystackPlanCodeEnv: "PAYSTACK_PLAN_STARTER",
    entitlements: {
      maxConfirmedOrdersPerMonth: 999_999, // Illimité (remplacé par credits)
      maxProofsPerMonth: -1,
      maxAgents: 1,
      overagePerOrderCents: 2_500, // 25 FCA/session → 2 500 FCA/100 sessions
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
      "500 sessions client / mois",
      "1 vendeur + 1 agent",
      "Proofs inbox complet",
      "Export CSV basique",
      "Notifications statut",
      "Acompte recommandé (défaut ON)",
    ],
    overageLabel: "2 500 FCA / 100 sessions",
    creditPackPriceFCFA: 2_500,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 50_000,
    currency: "XOF",
    interval: "monthly",
    description: "Équipe + volume + contrôle",
    popular: true,
    paystackPlanCodeEnv: "PAYSTACK_PLAN_PRO",
    entitlements: {
      maxConfirmedOrdersPerMonth: 999_999, // Illimité (remplacé par credits)
      maxProofsPerMonth: -1,
      maxAgents: 5,
      overagePerOrderCents: 2_000, // 20 FCA/session → 2 000 FCA/100 sessions
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
      "1500 sessions client / mois",
      "Jusqu'à 5 agents",
      "Filtres avancés + audit renforcé",
      "Export CSV avancé (multi-filtres)",
      "Notifications statut",
      "Acompte recommandé",
      "Support prioritaire",
    ],
    overageLabel: "2 000 FCA / 100 sessions",
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

/** Format price in FCA */
export function formatPriceFCFA(amount: number): string {
  if (amount === 0) return "Gratuit";
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCA";
}