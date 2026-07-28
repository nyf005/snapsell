"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { DataListSkeleton } from "~/components/ui/data-list-skeleton";
import { Card, CardContent } from "~/components/ui/card";

export function ProofsListSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-64" variant="text" />
        <Skeleton className="h-5 w-96" variant="text" />
      </div>

      <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
        <CardContent className="p-0">
          {/* Action bar skeleton */}
          <div className="flex flex-col gap-4 border-b border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex p-1">
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>

          {/* Table skeleton */}
          <DataListSkeleton columns={7} rows={5} />
        </CardContent>
      </Card>
    </div>
  );
}