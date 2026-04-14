"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { KpiCard } from "~/components/ui/kpi-card";

export function DashboardLoadingState() {
  return (
    <div className="space-y-10">
      {/* Section: À traiter */}
      <section aria-labelledby="a-traiter-heading">
        <h2
          id="a-traiter-heading"
          className="text-lg font-bold text-foreground flex items-center gap-2 mb-4"
        >
          <div className="size-5 bg-muted rounded animate-pulse" />
          À traiter
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Skeleton className="size-10 rounded-lg" />
                  <Skeleton className="h-5 w-12 rounded" />
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <Skeleton className="h-8 w-16" variant="text" />
                <Skeleton className="h-4 w-32" variant="text" />
                <Skeleton className="h-3 w-24" variant="text" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Section: Activité */}
      <section aria-labelledby="activite-heading">
        <h2
          id="activite-heading"
          className="text-lg font-bold text-foreground flex items-center gap-2 mb-6"
        >
          <div className="size-5 bg-muted rounded animate-pulse" />
          Activité
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Stats + Chart */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <KpiCardSkeleton />
              <KpiCardSkeleton />
            </div>
            <Card className="border-border overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-40" variant="text" />
                  <Skeleton className="h-3 w-24" variant="text" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Skeleton className="h-[200px] w-full rounded-lg" />
              </CardContent>
            </Card>
          </div>

          {/* Flux activité */}
          <Card className="border-border flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" variant="text" />
                <Skeleton className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex-1 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="size-2 rounded-full mt-1.5" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" variant="text" />
                    <Skeleton className="h-3 w-48" variant="text" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center gap-4 pb-2">
        <Skeleton className="size-10 rounded-xl" />
        <div className="min-w-0 space-y-0.5">
          <Skeleton className="h-3 w-24" variant="text" />
          <Skeleton className="h-6 w-16" variant="text" />
          <Skeleton className="h-3 w-20" variant="text" />
        </div>
      </CardHeader>
    </Card>
  );
}