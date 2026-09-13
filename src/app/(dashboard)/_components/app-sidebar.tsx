"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

import { HelpCircle, ChevronsUpDown, KeyRound, LogOut } from "lucide-react";

import { SnapSellLogo } from "~/components/auth/snapsel-logo";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { ChangePasswordDialog } from "./change-password-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "~/components/ui/dropdown-menu";
import { navItemsFor, primaryHrefFor } from "~/lib/navigation";
import { CreditsAlert } from "./credits-alert";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "~/components/ui/sidebar";
import { getInitials } from "~/lib/utils";

type AppSidebarProps = {
  userName: string;
  /** Adresse du compte — sert au changement de mot de passe. */
  userEmail: string;
  tenantName: string;
  canManageGrid: boolean;
  showBranding: boolean;
};

export function AppSidebar({
  userEmail,
  tenantName,
  canManageGrid,
  showBranding,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const accountTrigger = useRef<HTMLButtonElement>(null);


  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-[65px] border-b border-sidebar-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="h-auto rounded-md p-3">
              <Link href="/dashboard" prefetch className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
                <SnapSellLogo className="!size-8 shrink-0" />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-bold">
                    Snap<span className="text-primary">Sell</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Tableau de bord vendeur
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent aria-label="Navigation principale">
        <div className="flex flex-col pb-2 pt-3">
          <SidebarGroup className="py-0">
            <SidebarGroupContent><SidebarMenu>
              {navItemsFor("sidebar", canManageGrid).map((item) => {
                const Icon = item.icon;
                return <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={primaryHrefFor(pathname) === item.href} tooltip={item.label} className="min-h-11 rounded-md">
                    <Link href={item.href} aria-current={primaryHrefFor(pathname) === item.href ? "page" : undefined} prefetch={item.prefetch ?? true}><Icon className="size-4" /><span>{item.label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>;
              })}
            </SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>
      {showBranding && (
        <div className="px-4 py-2 text-center group-data-[collapsible=icon]:hidden">
          <p className="text-[10px] text-muted-foreground/60">
            Via{" "}
            <span className="font-semibold">
              Snap<span className="text-primary">Sell</span>
            </span>
          </p>
        </div>
      )}
      <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
        <SidebarMenu>
          {/*
            L'aide vit dans le pied, pas dans `NAV_ITEMS`.
            Deux raisons : ce n'est pas une tâche métier, et la section « Gérer » est
            tenue à deux entrées par `navigation.test.ts` — PRODUCT.md range les menus
            surchargés parmi ses anti-références. Sa place est ici, avec le compte et
            la déconnexion : ce qu'on cherche quand on cherche « où est-ce que… ».
          */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Aide">
              <Link href="/aide">
                <HelpCircle className="size-4" />
                <span>Aide</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="mt-2 border-t border-sidebar-border pt-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button ref={accountTrigger} type="button" aria-label={`Compte de ${tenantName}`} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-primary group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                  <Avatar className="size-9 shrink-0 group-data-[collapsible=icon]:size-8">
                    <AvatarFallback className="text-xs">{getInitials(tenantName)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-5 group-data-[collapsible=icon]:hidden">{tenantName}</span>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-64 max-w-[calc(100vw-2rem)] p-1.5" onCloseAutoFocus={(event) => { if (passwordOpen) event.preventDefault(); }}>
                <DropdownMenuItem className="min-h-11 cursor-pointer gap-3 px-3" onSelect={() => setPasswordOpen(true)}>
                  <KeyRound aria-hidden="true" />Changer le mot de passe
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-11 cursor-pointer gap-3 px-3 text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={() => { void signOut({ callbackUrl: "/login", redirect: true }); }}>
                  <LogOut aria-hidden="true" />Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ChangePasswordDialog email={userEmail} open={passwordOpen} onOpenChange={setPasswordOpen} onCloseAutoFocus={(event) => { event.preventDefault(); accountTrigger.current?.focus(); }} />
            <div className="mt-2 empty:hidden group-data-[collapsible=icon]:hidden">
              <CreditsAlert canManageSubscription={canManageGrid} />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
