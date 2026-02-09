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

export type ApproveProofInput = z.infer<typeof approveProofInputSchema>;
export type RejectProofInput = z.infer<typeof rejectProofInputSchema>;
export type BulkApproveProofsInput = z.infer<typeof bulkApproveProofsInputSchema>;
export type BulkRejectProofsInput = z.infer<typeof bulkRejectProofsInputSchema>;
