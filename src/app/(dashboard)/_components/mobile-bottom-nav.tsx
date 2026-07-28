"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { mobilePrimaryItems, mobileSheetItems } from "~/lib/navigation";
import { cn } from "~/lib/utils";

export function MobileBottomNav({ canManageGrid }: { canManageGrid: boolean }) {
  // Un seul modèle de navigation — voir src/lib/navigation.ts.
  const primaryItems = mobilePrimaryItems();
  const manageItems = mobileSheetItems(canManageGrid);

  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-[max(0.5rem,env(safe-area-inset-left))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_oklch(0.2_0.02_292/0.08)] md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.href === "/dashboard");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground active:bg-muted",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium text-muted-foreground"
            >
              <Menu className="size-5" />
              <span>Plus</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[78vh] rounded-t-2xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <SheetHeader className="border-b border-border pb-4 text-left">
              <SheetTitle>Tout SnapSell</SheetTitle>
            </SheetHeader>
            <div className="grid gap-1 py-4">
              {manageItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href, item.href === "/parametres");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground active:bg-muted",
                      )}
                    >
                      <Icon className="size-5 text-current" />
                      <span>{item.label}</span>
                    </Link>
                  );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
