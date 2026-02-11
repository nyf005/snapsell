"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "~/components/ui/button";

const NAV_ITEMS = [
  { href: "/ops/logs", label: "Logs" },
  { href: "/ops/errors", label: "File d\u2019erreurs" },
] as const;

export function OpsNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <Link href={item.href}>{item.label}</Link>
            </Button>
          );
        })}
      </nav>
    </header>
  );
}
