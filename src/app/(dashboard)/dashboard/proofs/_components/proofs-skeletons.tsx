"use client";

import { Skeleton } from "~/components/ui/skeleton";
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="w-12 px-4 py-3 text-center">
                    <Skeleton className="size-5 mx-auto rounded" />
                  </th>
                  <th className="w-24 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aperçu</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">N° commande</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reçue le</th>
                  <th className="w-12 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3 text-center">
                      <Skeleton className="size-5 mx-auto rounded" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="size-12 rounded-lg" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <Skeleton className="h-4 w-24" variant="text" />
                        <Skeleton className="h-4 w-16 rounded" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-12" variant="text" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-32" variant="text" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-40" variant="text" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Skeleton className="size-8 rounded-md" />
                        <Skeleton className="h-8 w-16 rounded-md" />
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