import { z } from "zod";

export const approveProofInputSchema = z.object({
  proofId: z.string().min(1),
});

export const rejectProofInputSchema = z.object({
  proofId: z.string().min(1),
});

export const bulkApproveProofsInputSchema = z.object({
  proofIds: z.array(z.string().min(1)).min(1).max(100),
});

export const bulkRejectProofsInputSchema = z.object({
  proofIds: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * Input pour list paginée.
 *
 * `status` est né d'un manque : la requête filtrait `pending` en dur, et c'était
 * le seul listing de preuves du produit. Une preuve validée ou refusée sortait
 * donc définitivement de l'interface — impossible de dire « quelles preuves ai-je
 * refusées cette semaine », ni de revoir celle d'une commande déjà en livraison.
 *
 * Le défaut reste `pending` : c'est la file de travail, et l'écran s'ouvre dessus.
 */
export const PROOF_STATUS_FILTERS = ["pending", "approved", "rejected", "all"] as const;
export type ProofStatusFilter = (typeof PROOF_STATUS_FILTERS)[number];

export const listPendingProofsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().cuid().optional(),
  status: z.enum(PROOF_STATUS_FILTERS).default("pending"),
});

export type ApproveProofInput = z.infer<typeof approveProofInputSchema>;
export type RejectProofInput = z.infer<typeof rejectProofInputSchema>;
export type BulkApproveProofsInput = z.infer<typeof bulkApproveProofsInputSchema>;
export type BulkRejectProofsInput = z.infer<typeof bulkRejectProofsInputSchema>;
export type ListPendingProofsInput = z.infer<typeof listPendingProofsInputSchema>;
