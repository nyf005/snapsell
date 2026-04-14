"use client";

import { Skeleton } from "~/components/ui/skeleton";
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catégorie</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prix (FCFA)</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut</th>
                  <th className="w-24 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-6 py-4">
                      <Skeleton className="h-5 w-16" variant="text" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-48" variant="text" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Skeleton className="h-5 w-20 ml-auto" variant="text" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Skeleton className="h-5 w-20 rounded mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Skeleton className="size-8 rounded-md" />
                        <Skeleton className="size-8 rounded-md" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}