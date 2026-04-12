"use client";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type DataPaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  className?: string;
};

export function DataPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  itemLabel,
  onPageChange,
  className,
}: DataPaginationProps) {
  if (totalItems === 0 || totalPages <= 1) {
    return null;
  }

  const rangeStart = ((currentPage - 1) * pageSize) + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        {rangeStart}-{rangeEnd} sur {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-2" aria-label="Pagination">
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Précédent
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Suivant
        </Button>
      </div>
    </div>
  );
}
