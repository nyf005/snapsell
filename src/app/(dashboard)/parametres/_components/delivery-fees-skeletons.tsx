"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { DataListSkeleton } from "~/components/ui/data-list-skeleton";
import { Card, CardContent, CardHeader } from "~/components/ui/card";

export function DeliveryFeesSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-48" variant="text" />
        <Skeleton className="h-5 w-80" variant="text" />
      </div>

      {/* Settings skeleton */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-32" variant="text" />
          <Skeleton className="h-4 w-64" variant="text" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-48" variant="text" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Zones Table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" variant="text" />
        <Card className="overflow-hidden rounded-2xl border-border pb-0 pt-0 shadow-sm">
          <CardContent className="p-0">
            <DataListSkeleton columns={4} rows={5} />
          </CardContent>
        </Card>
      </div>

      {/* Communes Table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" variant="text" />
        <Card className="overflow-hidden rounded-2xl border-border pb-0 pt-0 shadow-sm">
          <CardContent className="p-0">
            <DataListSkeleton columns={4} rows={5} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}