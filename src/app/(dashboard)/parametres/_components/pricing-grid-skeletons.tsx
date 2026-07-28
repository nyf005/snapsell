"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { DataListSkeleton } from "~/components/ui/data-list-skeleton";
import { Card, CardContent } from "~/components/ui/card";

export function PricingGridSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-48" variant="text" />
        <Skeleton className="h-5 w-80" variant="text" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-border">
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <Skeleton className="size-10 rounded-xl" />
                <div>
                  <Skeleton className="h-3 w-24 mb-1" variant="text" />
                  <Skeleton className="h-6 w-20" variant="text" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table skeleton */}
      <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
        <CardContent className="p-0">
          <DataListSkeleton columns={5} rows={5} />
        </CardContent>
      </Card>
    </div>
  );
}