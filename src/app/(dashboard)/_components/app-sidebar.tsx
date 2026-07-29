"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { HelpCircle, Home } from "lucide-react";

import { SnapSellLogo } from "~/components/auth/snapsel-logo";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { SignOutButton } from "./sign-out-button";
import { NAV_ITEMS, NAV_SECTIONS } from "~/lib/navigation";
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
import { cn, getInitials } from "~/lib/utils";

type MenuItem = {
  href: string;
  label: string;
  icon: typeof Home;
  requiresGridRole?: boolean;
  prefetch?: boolean;
};

type MenuGroup = {
  label: string;
  section: "Aujourd’hui" | "Vendre" | "Traiter" | "Gérer";
  items: MenuItem[];
  requiresGridRole?: boolean;
  mainItem?: MenuItem;
  prefetch?: boolean;
};

type VisibleMenuGroup = Omit<MenuGroup, "items"> & {
  items: MenuItem[];
};

/**
 * Groupes de la barre latérale, dérivés de la source unique (src/lib/navigation.ts).
 *
 * Chaque route est sa propre entrée : le sous-menu WhatsApp a disparu avec la fusion
 * de « Profil WhatsApp Business » dans la page Connexion.
 */
const menuGroups: MenuGroup[] = NAV_ITEMS.filter((item) =>
  item.surfaces.includes("sidebar"),
).map((item) => ({
  label: item.label,
  section: item.section,
  requiresGridRole: item.requiresGridRole,
  prefetch: item.prefetch ?? false,
  items: [
    {
      href: item.href,
      label: item.label,
      icon: item.icon,
      requiresGridRole: item.requiresGridRole,
      prefetch: item.prefetch ?? false,
    },
  ],
}));

const sectionOrder = NAV_SECTIONS;

type AppSidebarProps = {
  userName: string;
  tenantName: string;
  canManageGrid: boolean;
  showBranding: boolean;
};

export function AppSidebar({
  userName,
  tenantName,
  canManageGrid,
  showBranding,
}: AppSidebarProps) {
  const pathname = usePathname();

  const isItemActive = (href: string, exactMatch = false) => {
    // Pages racines : correspondance exacte uniquement pour éviter les faux positifs
    // Ex: /parametres ne doit pas être actif sur /parametres/whatsapp
    if (href === "/dashboard" || href === "/parametres") {
      return pathname === href;
    }
    if (exactMatch) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  // Vérifier si un sous-item est actif dans un groupe
  const hasActiveSubItem = (subMenuItems: MenuItem[]) => {
    return subMenuItems.some((item) => isItemActive(item.href, true));
  };

  const visibleMenuGroups = React.useMemo<VisibleMenuGroup[]>(() => {
    return menuGroups
      .filter((group) => !group.requiresGridRole || canManageGrid)
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.requiresGridRole || canManageGrid),
      }))
      .filter((group) => group.items.length > 0);
  }, [canManageGrid]);

  const renderGroup = (group: VisibleMenuGroup) => {
    if (group.items.length === 1) {
      const item = group.items[0]!;
      const isActive = isItemActive(item.href);
      const Icon = item.icon;
      return (
        <SidebarGroup key={group.label} className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className="h-10 rounded-md"
                >
                  <Link href={item.href} prefetch={item.prefetch ?? true}>
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      );
    }

    const mainItem =
      group.mainItem && (!group.mainItem.requiresGridRole || canManageGrid)
        ? group.mainItem
        : group.items[0]!;
    const MainIcon = mainItem.icon;
    const subMenuItems = group.mainItem ? group.items : group.items.slice(1);

    const hasActiveSub = hasActiveSubItem(subMenuItems);
    const mainItemActive = hasActiveSub || isItemActive(mainItem.href, true);

    return (
      <SidebarGroup key={group.label} className="py-0">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex w-full flex-col">
                <div className="flex w-full items-center">
                  <SidebarMenuButton
                    asChild
                    isActive={mainItemActive}
                    tooltip={mainItem.label}
                    className="h-10 flex-1 rounded-md"
                  >
                    <Link href={mainItem.href} prefetch={mainItem.prefetch ?? true}>
                      <MainIcon className="size-4" />
                      <span>{mainItem.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </div>
                {subMenuItems.length > 0 && (
                  <div className="ml-4 mt-1 space-y-0.5 px-2 py-1 group-data-[collapsible=icon]:hidden">
                    {subMenuItems.map((item) => {
                      const isActive = isItemActive(item.href, true);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch={item.prefetch ?? true}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            isActive &&
                              "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

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
          {sectionOrder.map((section) => {
            const groupsInSection = visibleMenuGroups.filter((group) => group.section === section);
            if (groupsInSection.length === 0) {
              return null;
            }

            return (
              <div key={section} className="px-2 pt-3 first:pt-1">
                <div className="mb-1 px-2 group-data-[collapsible=icon]:sr-only">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {section}
                  </p>
                </div>
                <div className="space-y-0.5">
                  {groupsInSection.map((group) => renderGroup(group))}
                </div>
              </div>
            );
          })}
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
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2 rounded-md p-2">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {tenantName}
                </p>
              </div>
              <CreditsAlert canManageSubscription={canManageGrid} />
              <SignOutButton className="shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
