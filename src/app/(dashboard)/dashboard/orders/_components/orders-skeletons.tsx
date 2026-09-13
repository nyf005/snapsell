"use client";
import { DataListSkeleton } from "~/components/ui/data-list-skeleton";
export function OrdersListSkeleton() {
  return <div role="status" aria-label="Chargement des commandes"><DataListSkeleton columns={7} rows={4} /></div>;
}
