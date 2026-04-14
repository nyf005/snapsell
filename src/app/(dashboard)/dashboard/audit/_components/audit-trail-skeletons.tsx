"use client";

import { Skeleton } from "~/components/ui/skeleton";
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Événement</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catégorie</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acteur</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr
                  key={i}
                  className={`border-b border-border ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                >
                  {/* Événement */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <Skeleton className="size-3.5 rounded" />
                        <Skeleton className="h-4 w-36" variant="text" />
                      </div>
                      {i % 3 === 0 && (
                        <Skeleton className="ml-5 h-3 w-20" variant="text" />
                      )}
                    </div>
                  </td>
                  {/* Catégorie */}
                  <td className="px-6 py-4">
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </td>
                  {/* Acteur */}
                  <td className="px-6 py-4">
                    <Skeleton className="h-4 w-16" variant="text" />
                  </td>
                  {/* Date */}
                  <td className="px-6 py-4">
                    <Skeleton className="h-4 w-24" variant="text" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
