"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

export function LiveOpsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-32" variant="text" />
          <Skeleton className="h-5 w-64" variant="text" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
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
                  <Skeleton className="h-6 w-12" variant="text" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
        {/* Inventory Table */}
        <div className="flex flex-col lg:col-span-7">
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-border gap-0 pt-0 shadow-sm">
            <CardHeader className="flex items-center border-b border-border bg-muted/30 px-6 py-2.5">
              <div className="flex w-full items-center justify-between">
                <Skeleton className="h-5 w-48" variant="text" />
                <Skeleton className="h-3 w-28" variant="text" />
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <div className="w-full overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Code</th>
                      <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Prix</th>
                      <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Stock</th>
                      <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">Réservées</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="px-6 py-4">
                          <Skeleton className="h-5 w-16" variant="text" />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Skeleton className="h-5 w-20 ml-auto" variant="text" />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-2 w-24 rounded-full" />
                            <Skeleton className="h-4 w-8" variant="text" />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="secondary">
                            <Skeleton className="h-4 w-6" />
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reservations + Momentum */}
        <div className="flex min-h-0 flex-col gap-6 lg:col-span-5">
          <Card className="flex flex-1 flex-col overflow-hidden rounded-xl border-border pt-0 shadow-sm">
            <CardHeader className="flex items-center border-b border-border bg-muted/30 px-6 py-2.5">
              <div className="flex w-full items-center justify-between">
                <Skeleton className="h-5 w-32" variant="text" />
                <Skeleton className="h-4 w-28" variant="text" />
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <div className="space-y-2 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 rounded-lg border p-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" variant="text" />
                      <Skeleton className="h-3 w-20" variant="text" />
                      <Skeleton className="h-3 w-24" variant="text" />
                    </div>
                    <Skeleton className="h-8 w-16 rounded-md" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-xl border-0 bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <CardContent className="p-6">
              <Skeleton className="h-5 w-32 mb-2" variant="text" />
              <Skeleton className="h-8 w-16 mb-2" variant="text" />
              <Skeleton className="h-3 w-24 mb-4" variant="text" />
              <Skeleton className="h-3 w-full rounded-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}