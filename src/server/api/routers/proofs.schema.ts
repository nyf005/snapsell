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

/** Input pour list paginée */
export const listPendingProofsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().cuid().optional(),
});

export type ApproveProofInput = z.infer<typeof approveProofInputSchema>;
export type RejectProofInput = z.infer<typeof rejectProofInputSchema>;
export type BulkApproveProofsInput = z.infer<typeof bulkApproveProofsInputSchema>;
export type BulkRejectProofsInput = z.infer<typeof bulkRejectProofsInputSchema>;
export type ListPendingProofsInput = z.infer<typeof listPendingProofsInputSchema>;
