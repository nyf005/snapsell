"use client";

import { signOut } from "next-auth/react";

import { LogOut } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function SignOutButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Déconnecter"
      className={cn(
        "text-white/90 hover:bg-white/10 hover:text-white shrink-0",
        className
      )}
      onClick={() =>
        signOut({ callbackUrl: "/login", redirect: true })
      }
      {...props}
    >
      <LogOut className="size-4" />
    </Button>
  );
}
