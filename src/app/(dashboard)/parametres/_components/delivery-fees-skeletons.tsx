"use client";

import { Skeleton } from "~/components/ui/skeleton";
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/60">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zone</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prix (FCFA)</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Communes</th>
                    <th className="w-24 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-6 py-4">
                        <Skeleton className="h-5 w-24" variant="text" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-5 w-20" variant="text" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-4 w-16" variant="text" />
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

      {/* Communes Table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" variant="text" />
        <Card className="overflow-hidden rounded-2xl border-border pb-0 pt-0 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/60">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commune</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prix (FCFA)</th>
                    <th className="w-12 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-6 py-4">
                        <Skeleton className="h-5 w-32" variant="text" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-5 w-20" variant="text" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
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
    </div>
  );
}