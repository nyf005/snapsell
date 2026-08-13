"use client";

import { Headset, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "~/components/ui/button";

const NAV_ITEMS = [
  { href: "/ops/whatsapp", label: "WhatsApp" },
  { href: "/ops/logs", label: "Logs" },
  { href: "/ops/errors", label: "File d\u2019erreurs" },
] as const;

type OpsNavProps = {
  user: {
    email: string;
    name?: string | null;
  };
};

export function OpsNav({ user }: OpsNavProps) {
  const pathname = usePathname();
  const accountLabel = user.name?.trim() || "Compte support";

  return (
    <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:flex-row sm:items-center">
      <nav
        aria-label="Navigation du support"
        className="flex w-full min-w-0 items-center gap-1 overflow-x-auto sm:w-auto"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <Link href={item.href} aria-current={isActive ? "page" : undefined}>
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      <div className="flex w-full items-center justify-between gap-3 border-t border-border pt-2 sm:ml-auto sm:w-auto sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Headset className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-foreground">
              {accountLabel}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <Button variant="outline" size="sm" className="min-h-10 sm:min-h-8" asChild>
          <Link href="/logout">
            <LogOut aria-hidden="true" />
            Se déconnecter
          </Link>
        </Button>
      </div>
    </header>
  );
}
