"use client";

import { DataListSkeleton } from "~/components/ui/data-list-skeleton";
import { Card, CardContent } from "~/components/ui/card";

export function CatalogueListSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
        <CardContent className="p-0">
          <DataListSkeleton columns={8} rows={5} />
        </CardContent>
      </Card>
    </div>
  );
}