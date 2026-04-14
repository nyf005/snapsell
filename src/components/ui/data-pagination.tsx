"use client";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type DataPaginationProps = {
  currentPage?: number;
  totalPages?: number;
  totalItems: number;
  pageSize: number;
  itemLabel?: string;
  onPageChange?: (page: number) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  isLoading?: boolean;
  summary?: string;
  className?: string;
};

export function DataPagination({
  currentPage = 1,
  totalPages,
  totalItems,
  pageSize,
  itemLabel,
  onPageChange,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  isLoading = false,
  summary,
  className,
}: DataPaginationProps) {
  const hasPageControls = typeof onPageChange === "function" && typeof totalPages === "number";
  const hasLoadMore = typeof onNext === "function";
  const showPrevious = hasPageControls || typeof onPrevious === "function";
  const showNext = hasPageControls || hasLoadMore;
  const pageControlsVisible = hasPageControls && totalPages > 1;
  const footerVisible = totalItems > 0 || pageControlsVisible || showNext || showPrevious || !!summary;

  if (!footerVisible) {
    return null;
  }

  const rangeStart = ((currentPage - 1) * pageSize) + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);
  const footerText = summary
    ? summary
    : itemLabel
    ? `${rangeStart}-${rangeEnd} sur ${totalItems} ${itemLabel}`
    : `${totalItems} élément${totalItems > 1 ? "s" : ""}`;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{footerText}</p>
      <div className="flex items-center gap-2" aria-label="Pagination">
        {showPrevious ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={hasPageControls ? currentPage === 1 : !hasPrevious}
            onClick={() => {
              if (hasPageControls) {
                onPageChange?.(currentPage - 1);
              } else {
                onPrevious?.();
              }
            }}
          >
            Précédent
          </Button>
        ) : null}
        {showNext ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isLoading || (hasPageControls ? currentPage === totalPages : !hasNext)}
            onClick={() => {
              if (hasPageControls) {
                onPageChange?.(currentPage + 1);
              } else {
                onNext?.();
              }
            }}
          >
            {hasLoadMore ? "Charger la suite" : "Suivant"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
