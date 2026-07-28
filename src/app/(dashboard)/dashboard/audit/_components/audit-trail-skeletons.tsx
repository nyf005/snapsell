"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { DataListSkeleton } from "~/components/ui/data-list-skeleton";
import { Card, CardContent } from "~/components/ui/card";

export function AuditTrailSkeleton() {
  return (
    <div className="space-y-8">
      {/* Filtres skeleton */}
      <Card className="rounded-xl border border-border bg-card shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[180px] flex-1">
              <Skeleton className="mb-2 h-3 w-16" variant="text" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <div className="min-w-[220px] flex-1">
              <Skeleton className="mb-2 h-3 w-16" variant="text" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Tableau skeleton */}
      <Card className="overflow-hidden rounded-2xl border-border gap-0 p-0 shadow-sm">
        <DataListSkeleton columns={4} rows={5} />
        {/* Footer pagination skeleton */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3">
          <Skeleton className="h-4 w-32" variant="text" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        </div>
      </Card>
    </div>
  );
}
