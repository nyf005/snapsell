-- Drop redundant index: UNIQUE already creates an index on (tenant_id, phone_number)
-- Safe if index was never created (e.g. migration 20260209150000 was applied without it)
DROP INDEX IF EXISTS "opt_outs_tenant_id_phone_number_idx";
