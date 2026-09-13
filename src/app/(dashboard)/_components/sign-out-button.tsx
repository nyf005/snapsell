"use client";

import { signOut } from "next-auth/react";

import { LogOut } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function SignOutButton({
  className,
  showLabel = false,
  ...props
}: React.ComponentProps<typeof Button> & { showLabel?: boolean }) {
  return (
    <Button
      variant="ghost"
      size={showLabel ? "default" : "icon"}
      aria-label="Déconnecter"
      className={cn(
        "shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        showLabel && "min-h-11 w-full justify-start gap-3 px-3 text-sm font-normal group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
        className
      )}
      onClick={() =>
        signOut({ callbackUrl: "/login", redirect: true })
      }
      {...props}
    >
      <LogOut className="size-4 shrink-0" aria-hidden="true" />
      {showLabel && <span className="group-data-[collapsible=icon]:hidden">Se déconnecter</span>}
    </Button>
  );
}
