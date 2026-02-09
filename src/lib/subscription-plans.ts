/**
 * Story 7A.2: Configuration complète des 3 plans (Free, Starter, Pro)
 * avec entitlements, prix, overages, feature flags, plan codes Paystack.
 *
 * Métrique de facturation = commandes confirmées.
 */

export type PlanId = "free" | "starter" | "pro";

export interface PlanEntitlements {
  maxConfirmedOrdersPerMonth: number;
  maxProofsPerMonth: number; // -1 = illimité
  maxAgents: number;
  overagePerOrderCents: number; // 0 = blocage (Free)
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
  overageLabel?: string; // Ex: "75 FCFA / commande supplémentaire"
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
      maxConfirmedOrdersPerMonth: 50,
      maxProofsPerMonth: 20,
      maxAgents: 0,
      overagePerOrderCents: 0, // Blocage, pas d'overage
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
      "50 commandes confirmées / mois",
      "1 vendeur (pas d'agents)",
      "Grille catégories → prix",
      "Réservation + file + TTL",
      "Dashboard commandes basique",
      "20 preuves / mois",
    ],
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
      maxConfirmedOrdersPerMonth: 300,
      maxProofsPerMonth: -1,
      maxAgents: 1,
      overagePerOrderCents: 7_500, // 75 FCFA (en centimes Paystack = kobo)
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
      "300 commandes confirmées / mois",
      "1 vendeur + 1 agent",
      "Proofs inbox complet",
      "Export CSV basique",
      "Notifications statut",
      "Acompte recommandé (défaut ON)",
    ],
    overageLabel: "75 FCFA / commande au-delà",
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
      maxConfirmedOrdersPerMonth: 700,
      maxProofsPerMonth: -1,
      maxAgents: 5,
      overagePerOrderCents: 10_000, // 100 FCFA
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
      "700 commandes confirmées / mois",
      "Jusqu'à 5 agents",
      "Filtres avancés + audit renforcé",
      "Export CSV avancé (multi-filtres)",
      "Notifications statut",
      "Acompte recommandé",
      "Support prioritaire",
    ],
    overageLabel: "100 FCFA / commande au-delà",
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
  return Object.values(SUBSCRIPTION_PLANS).find(
    (p) => {
      const code = getPaystackPlanCode(p);
      return code != null && code === planCode;
    },
  );
}

/** Format price in FCFA */
export function formatPriceFCFA(amount: number): string {
  if (amount === 0) return "Gratuit";
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}
