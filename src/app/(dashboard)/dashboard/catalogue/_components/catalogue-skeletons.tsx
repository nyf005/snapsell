"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

export function CatalogueListSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-16">Photo</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Code</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prix</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qté totale</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispo</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Réservé</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Origine</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-3 py-2">
                      <Skeleton className="size-10 rounded-lg" />
                    </td>
                    <td className="px-3 py-2">
                      <Skeleton className="h-4 w-12" variant="text" />
                    </td>
                    <td className="px-3 py-2">
                      <Skeleton className="h-4 w-16" variant="text" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Skeleton className="h-4 w-8 ml-auto" variant="text" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Badge variant="secondary" className="h-5 w-8">
                        <Skeleton className="h-3 w-4" />
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Skeleton className="h-4 w-8 ml-auto" variant="text" />
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">
                        <Skeleton className="h-3 w-16" />
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Skeleton className="size-8 rounded" />
                        <Skeleton className="size-8 rounded" />
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