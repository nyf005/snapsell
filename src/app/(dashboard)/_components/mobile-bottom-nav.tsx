"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mobilePrimaryItems, primaryHrefFor } from "~/lib/navigation";
import { cn } from "~/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  return <nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-[max(0.5rem,env(safe-area-inset-left))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
    <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
      {mobilePrimaryItems().map((item) => {
        const Icon = item.icon;
        const active = primaryHrefFor(pathname) === item.href;
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
          className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary", active ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-muted")}>
          <Icon className="size-5" aria-hidden="true" /><span>{item.label}</span>
        </Link>;
      })}
    </div>
  </nav>;
}
