"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "~/components/ui/card";

export function FaqSettingsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-48" variant="text" />
        <Skeleton className="h-5 w-80" variant="text" />
      </div>

      {/* Form skeleton */}
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-96" variant="text" />
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-32" variant="text" />
              <Skeleton className="h-4 w-64" variant="text" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
          ))}
          <div className="flex items-center gap-4 pt-4">
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}