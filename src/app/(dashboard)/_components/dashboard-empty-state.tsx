"use client";

import { type ComponentType, type ReactNode } from "react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "~/components/ui/empty";
import { cn } from "~/lib/utils";

type DashboardEmptyStateProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function DashboardEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: DashboardEmptyStateProps) {
  return (
    <Empty className={cn("border-border bg-background/70 p-8", className)}>
      <EmptyMedia variant="icon">
        <Icon className="size-8" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <div className="w-full pt-2">{action}</div> : null}
    </Empty>
  );
}
