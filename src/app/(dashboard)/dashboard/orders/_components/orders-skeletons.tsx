"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { DataListSkeleton } from "~/components/ui/data-list-skeleton";
import { Card, CardContent } from "~/components/ui/card";

export function OrdersListSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" variant="text" />
          <Skeleton className="h-5 w-80" variant="text" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-border">
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <Skeleton className="size-10 rounded-xl" />
                <div>
                  <Skeleton className="h-3 w-20 mb-1" variant="text" />
                  <Skeleton className="h-6 w-12" variant="text" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters skeleton */}
      <Card className="rounded-xl border border-border bg-card shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1 md:min-w-[280px]">
              <Skeleton className="h-4 w-20 mb-2" variant="text" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
            <div className="w-full md:w-48">
              <Skeleton className="h-4 w-16 mb-2" variant="text" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
            <div className="w-full md:w-72">
              <Skeleton className="h-4 w-16 mb-2" variant="text" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
            <Skeleton className="h-11 w-28 rounded-md" />
          </div>
          <div className="flex gap-1 border-t border-border pt-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table skeleton */}
      <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
        <CardContent className="p-0">
          <DataListSkeleton columns={6} rows={5} />
        </CardContent>
      </Card>
    </div>
  );
}