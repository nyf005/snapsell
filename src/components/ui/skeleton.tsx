import { cn } from "~/lib/utils"

function Skeleton({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "card" | "table-row" | "text"
}) {
  const variantClasses = {
    default: "bg-accent animate-pulse rounded-md",
    card: "bg-muted animate-pulse rounded-xl border border-border",
    "table-row": "bg-muted/50 animate-pulse rounded",
    text: "bg-muted animate-pulse rounded h-4",
  }

  return (
    <div
      data-slot="skeleton"
      className={cn(variantClasses[variant], className)}
      {...props}
    />
  )
}

export { Skeleton }
